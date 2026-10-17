begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.tenants (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), currency text not null default 'TRY' check(currency ~ '^[A-Z]{3}$'),
 timezone text not null default 'Europe/Istanbul', active boolean not null default true, created_at timestamptz not null default now()
);
create table public.memberships (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(),
 user_id uuid not null references auth.users(id), role text not null check(role in ('owner','staff')),
 active boolean not null default true, primary key(tenant_id,id), unique(tenant_id,user_id)
);
create index memberships_user_access on public.memberships(user_id,tenant_id) where active;
-- This is the only RLS bypass: non-exposed, fixed search_path, no caller-supplied user.
-- Required to avoid recursive membership policies. Never uses editable JWT metadata.
create function private.has_role(target uuid, allowed text[]) returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
 select 1 from public.memberships m join public.tenants t on t.id=m.tenant_id
 where m.tenant_id=target and m.user_id=auth.uid() and m.active and t.active and m.role=any(allowed))
$$;
revoke all on function private.has_role(uuid,text[]) from public,anon,authenticated;
grant execute on function private.has_role(uuid,text[]) to authenticated;

create table public.tenant_settings (
 tenant_id uuid primary key references public.tenants(id), acceptance_mode text not null default 'manual' check(acceptance_mode in ('manual','automatic')),
 ordering_enabled boolean not null default false, version integer not null default 1 check(version>0)
);
create table public.dining_tables (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 active boolean not null default true, primary key(tenant_id,id), unique(tenant_id,name)
);
create table public.table_qr_tokens (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), table_id uuid not null,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), version integer not null check(version>0), revoked_at timestamptz,
 primary key(tenant_id,id), unique(tenant_id,table_id,version),
 foreign key(tenant_id,table_id) references public.dining_tables(tenant_id,id)
);
create table public.guest_sessions (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), table_id uuid not null, qr_version integer not null,
 session_hash text not null unique check(session_hash ~ '^[0-9a-f]{64}$'), created_at timestamptz not null default now(), expires_at timestamptz not null,
 revoked_at timestamptz, primary key(tenant_id,id), unique(tenant_id,id,table_id),
 check(expires_at>created_at and expires_at<=created_at+interval '4 hours'),
 foreign key(tenant_id,table_id,qr_version) references public.table_qr_tokens(tenant_id,table_id,version)
);
create table public.categories (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 sort_order integer not null default 0, archived_at timestamptz, primary key(tenant_id,id)
);
create table public.products (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), category_id uuid not null,
 name text not null check(length(name) between 1 and 160), description text not null default '' check(length(description)<=2000),
 price_minor integer not null check(price_minor>=0), image_path text, available boolean not null default true, archived_at timestamptz,
 primary key(tenant_id,id), foreign key(tenant_id,category_id) references public.categories(tenant_id,id)
);
create table public.orders (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), table_id uuid not null, guest_session_id uuid not null,
 status text not null check(status in ('pending_acceptance','accepted','preparing','ready','served','rejected','cancelled')),
 total_minor integer not null check(total_minor>=0), currency text not null check(currency ~ '^[A-Z]{3}$'),
 acceptance_mode text not null check(acceptance_mode in ('manual','automatic')), version integer not null default 1 check(version>0),
 note text not null default '' check(length(note)<=500), created_at timestamptz not null default now(), primary key(tenant_id,id),
 unique(tenant_id,id,guest_session_id), foreign key(tenant_id,table_id) references public.dining_tables(tenant_id,id),
 foreign key(tenant_id,guest_session_id,table_id) references public.guest_sessions(tenant_id,id,table_id)
);
create index orders_queue on public.orders(tenant_id,status,created_at,id);
create index orders_session on public.orders(tenant_id,guest_session_id,table_id);
create table public.order_items (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), order_id uuid not null, product_id uuid not null,
 product_name text not null, unit_price_minor integer not null check(unit_price_minor>=0), quantity integer not null check(quantity between 1 and 20),
 line_total_minor integer generated always as (unit_price_minor*quantity) stored,
 primary key(tenant_id,id), foreign key(tenant_id,order_id) references public.orders(tenant_id,id),
 foreign key(tenant_id,product_id) references public.products(tenant_id,id)
);
create table public.order_events (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), order_id uuid not null,
 from_status text, to_status text not null check(to_status in ('pending_acceptance','accepted','preparing','ready','served','rejected','cancelled')),
 actor_id uuid references auth.users(id), reason text check(length(reason)<=500), created_at timestamptz not null default now(),
 check(to_status not in ('rejected','cancelled') or (reason is not null and length(trim(reason))>0)), primary key(tenant_id,id),
 foreign key(tenant_id,order_id) references public.orders(tenant_id,id)
);
create table public.idempotency_records (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), guest_session_id uuid not null,
 key text not null check(length(key) between 1 and 200), request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'), order_id uuid not null,
 expires_at timestamptz not null, primary key(tenant_id,id), unique(tenant_id,guest_session_id,key),
 foreign key(tenant_id,guest_session_id) references public.guest_sessions(tenant_id,id),
 foreign key(tenant_id,order_id,guest_session_id) references public.orders(tenant_id,id,guest_session_id)
);
create table public.audit_logs (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), actor_id uuid references auth.users(id),
 action text not null, target_id uuid, created_at timestamptz not null default now(), primary key(tenant_id,id)
);
-- Index every referencing key to keep tenant checks and FK maintenance bounded.
create index products_category on public.products(tenant_id,category_id);
create index items_order on public.order_items(tenant_id,order_id);
create index items_product on public.order_items(tenant_id,product_id);
create index events_order on public.order_events(tenant_id,order_id);
create index idempotency_order on public.idempotency_records(tenant_id,order_id,guest_session_id);

-- Explicit grants override Supabase projects with permissive default privileges.
do $$ declare tab text; begin
 foreach tab in array array['tenants','memberships','tenant_settings','dining_tables','table_qr_tokens','guest_sessions','categories','products','orders','order_items','order_events','idempotency_records','audit_logs'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('alter table public.%I force row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 end loop;
 foreach tab in array array['tenants','memberships','tenant_settings','dining_tables','categories','products','orders','order_items','order_events','audit_logs'] loop
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy member_read on public.%I for select to authenticated using (private.has_role(%s, array[''owner'',''staff'']))',tab,case when tab='tenants' then 'id' else 'tenant_id' end);
 end loop;
 foreach tab in array array['categories','products','dining_tables'] loop
 execute format('grant insert,update,delete on public.%I to authenticated',tab);
 execute format('create policy owner_insert on public.%I for insert to authenticated with check(private.has_role(tenant_id,array[''owner'']))',tab);
 execute format('create policy owner_update on public.%I for update to authenticated using(private.has_role(tenant_id,array[''owner''])) with check(private.has_role(tenant_id,array[''owner'']))',tab);
 execute format('create policy owner_delete on public.%I for delete to authenticated using(private.has_role(tenant_id,array[''owner'']))',tab);
 end loop;
end $$;
grant update(acceptance_mode,ordering_enabled,version) on public.tenant_settings to authenticated;
create policy owner_update on public.tenant_settings for update to authenticated
 using(private.has_role(tenant_id,array['owner'])) with check(private.has_role(tenant_id,array['owner']));
-- Membership administration is deliberately narrow: owners manage staff only.
-- Owner provisioning/transfers remain a controlled platform operation.
grant insert(tenant_id,user_id,role,active), update(active), delete on public.memberships to authenticated;
create policy owner_add_staff on public.memberships for insert to authenticated
 with check(role='staff' and private.has_role(tenant_id,array['owner']));
create policy owner_change_staff on public.memberships for update to authenticated
 using(role='staff' and private.has_role(tenant_id,array['owner']))
 with check(role='staff' and private.has_role(tenant_id,array['owner']));
create policy owner_remove_staff on public.memberships for delete to authenticated
 using(role='staff' and private.has_role(tenant_id,array['owner']));
commit;
