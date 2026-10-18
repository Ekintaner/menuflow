begin;
alter table public.dining_tables add column visit_version integer not null default 1 check(visit_version>0);
alter table public.guest_sessions add column visit_version integer not null default 1;
create table public.table_checks (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(), table_id uuid not null,
 visit_version integer not null check(visit_version>0), state text not null default 'open' check(state in('open','closed')),
 payment_status text not null default 'unpaid' check(payment_status in('unpaid','paid','void')),
 currency text not null, opened_at timestamptz not null default now(), closed_at timestamptz,
 settled_total_minor bigint, version integer not null default 1,
 primary key(tenant_id,id), unique(tenant_id,id,table_id),unique(tenant_id,table_id,visit_version),
 foreign key(tenant_id,table_id) references public.dining_tables(tenant_id,id),
 check((state='open' and payment_status='unpaid' and closed_at is null and settled_total_minor is null) or
 (state='closed' and payment_status in('paid','void') and closed_at is not null and settled_total_minor is not null and settled_total_minor>=0 and (payment_status<>'void' or settled_total_minor=0)))
);
create unique index table_checks_one_open on public.table_checks(tenant_id,table_id) where state='open';
create index table_checks_history on public.table_checks(tenant_id,opened_at desc,id);
create table public.check_settlements (
 tenant_id uuid not null references public.tenants(id), id uuid not null default gen_random_uuid(),check_id uuid not null,
 request_key text not null check(length(request_key) between 1 and 200),action text not null check(action in('pay','void')),
 amount_minor bigint not null check(amount_minor>=0),currency text not null,actor_id uuid not null references auth.users(id),reason text,
 created_at timestamptz not null default now(),primary key(tenant_id,id),unique(tenant_id,check_id),
 foreign key(tenant_id,check_id) references public.table_checks(tenant_id,id),
 check(action<>'void' or length(trim(coalesce(reason,''))) between 1 and 500)
);
create index check_settlements_actor on public.check_settlements(actor_id);
alter table public.orders add column check_id uuid;
-- Existing historical orders are explicitly migrated into a legacy visit, never discarded.
insert into public.table_checks(tenant_id,table_id,visit_version,currency)
 select distinct o.tenant_id,o.table_id,1,t.currency from public.orders o join public.tenants t on t.id=o.tenant_id;
update public.orders o set check_id=c.id from public.table_checks c where c.tenant_id=o.tenant_id and c.table_id=o.table_id;
alter table public.orders add constraint orders_check_tenant_table_fk foreign key(tenant_id,check_id,table_id) references public.table_checks(tenant_id,id,table_id);
create index orders_check on public.orders(tenant_id,check_id,created_at,id);

create function private.bind_guest_visit() returns trigger language plpgsql security invoker set search_path='' as $$
begin select visit_version into new.visit_version from public.dining_tables where tenant_id=new.tenant_id and id=new.table_id;return new;end $$;
revoke all on function private.bind_guest_visit() from public,anon,authenticated;
create trigger bind_guest_visit before insert on public.guest_sessions for each row execute function private.bind_guest_visit();
create function private.bind_order_check() returns trigger language plpgsql security invoker set search_path='' as $$
declare current_visit integer; guest_visit integer;
begin
 select visit_version into current_visit from public.dining_tables where tenant_id=new.tenant_id and id=new.table_id for update;
 select visit_version into guest_visit from public.guest_sessions where tenant_id=new.tenant_id and id=new.guest_session_id;
 if guest_visit is distinct from current_visit then raise exception 'SESSION_REQUIRED';end if;
 select id into new.check_id from public.table_checks where tenant_id=new.tenant_id and table_id=new.table_id and state='open';
 if new.check_id is null then
  insert into public.table_checks(tenant_id,table_id,visit_version,currency) values(new.tenant_id,new.table_id,current_visit,new.currency) returning id into new.check_id;
 end if;return new;
end $$;
revoke all on function private.bind_order_check() from public,anon,authenticated;
create trigger bind_order_check before insert on public.orders for each row execute function private.bind_order_check();
alter table public.orders alter column check_id set not null;

create function private.protect_billed_order() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.tenant_id,new.id,new.table_id,new.guest_session_id,new.check_id,new.total_minor,new.currency,new.created_at) is distinct from
 (old.tenant_id,old.id,old.table_id,old.guest_session_id,old.check_id,old.total_minor,old.currency,old.created_at) then raise exception 'ORDER_SNAPSHOT_IMMUTABLE';end if;
 if exists(select 1 from public.table_checks where tenant_id=old.tenant_id and id=old.check_id and state='closed') then raise exception 'CHECK_CLOSED';end if;
 return new;
end $$;
revoke all on function private.protect_billed_order() from public,anon,authenticated;
create trigger protect_billed_order before update on public.orders for each row execute function private.protect_billed_order();
-- The existing transition RPC is already an audited, role-checked definer; serialize
-- its order update on the same check row that settlement locks. No new role bypass.
create function private.lock_order_check() returns trigger language plpgsql security invoker set search_path='' as $$
begin perform 1 from public.table_checks where tenant_id=old.tenant_id and id=old.check_id for update;return new;end $$;
revoke all on function private.lock_order_check() from public,anon,authenticated;
create trigger a_lock_order_check before update on public.orders for each row execute function private.lock_order_check();

create function private.settle_check(target_tenant uuid,target_check uuid,expected_version integer,request_key text,settlement_action text,expected_total bigint,supplied_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.table_checks; previous public.check_settlements; total bigint; table_key uuid;
begin
 if not private.has_role(target_tenant,array['owner','staff']) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if request_key is null or length(request_key) not between 1 and 200 or settlement_action not in('pay','void') or settlement_action is null or expected_total is null or expected_total<0 or expected_version is null then raise exception 'INVALID_INPUT';end if;
 select table_id into table_key from public.table_checks where tenant_id=target_tenant and id=target_check;
 if not found then raise exception 'CHECK_NOT_FOUND';end if;
 perform 1 from public.dining_tables where tenant_id=target_tenant and id=table_key for update;
 select * into c from public.table_checks where tenant_id=target_tenant and id=target_check for update;
 select * into previous from public.check_settlements where tenant_id=target_tenant and check_id=target_check;
 if found then
  if previous.request_key=request_key and previous.action=settlement_action and previous.amount_minor=expected_total and coalesce(previous.reason,'')=coalesce(nullif(trim(supplied_reason),''),'') then return to_jsonb(previous);end if;
  raise exception 'SETTLEMENT_CONFLICT';
 end if;
 if c.state<>'open' or c.version<>expected_version then raise exception 'VERSION_CONFLICT';end if;
 -- Do not lock order rows here: transitions hold order then check; locking them
 -- in reverse order would deadlock. All UPDATEs take the check lock before writing.
 if exists(select 1 from public.orders where tenant_id=target_tenant and check_id=target_check and status not in('served','rejected','cancelled')) then raise exception 'ACTIVE_ORDERS';end if;
 select coalesce(sum(total_minor),0) into total from public.orders where tenant_id=target_tenant and check_id=target_check and status not in('rejected','cancelled');
 if total<>expected_total then raise exception 'TOTAL_CHANGED';end if;
 if settlement_action='void' and (total<>0 or length(trim(coalesce(supplied_reason,''))) not between 1 and 500) then raise exception 'INVALID_INPUT';end if;
 if length(coalesce(supplied_reason,''))>500 then raise exception 'INVALID_INPUT';end if;
 insert into public.check_settlements(tenant_id,check_id,request_key,action,amount_minor,currency,actor_id,reason)
 values(target_tenant,target_check,request_key,settlement_action,total,c.currency,auth.uid(),nullif(trim(supplied_reason),'')) returning * into previous;
 update public.table_checks set state='closed',payment_status=case when settlement_action='pay' then 'paid' else 'void' end,
 closed_at=now(),settled_total_minor=total,version=version+1 where tenant_id=target_tenant and id=target_check;
 update public.dining_tables set visit_version=visit_version+1 where tenant_id=target_tenant and id=c.table_id;
 insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,auth.uid(),'check:'||settlement_action,target_check);
 return to_jsonb(previous);
end $$;
revoke all on function private.settle_check(uuid,uuid,integer,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function private.settle_check(uuid,uuid,integer,text,text,bigint,text) to authenticated;
create function public.settle_check(target_tenant uuid,target_check uuid,expected_version integer,request_key text,settlement_action text,expected_total bigint,supplied_reason text default null)
returns jsonb language sql security invoker set search_path='' as $$select private.settle_check(target_tenant,target_check,expected_version,request_key,settlement_action,expected_total,supplied_reason)$$;
revoke all on function public.settle_check(uuid,uuid,integer,text,text,bigint,text) from public,anon,authenticated,service_role;
grant execute on function public.settle_check(uuid,uuid,integer,text,text,bigint,text) to authenticated;

do $$declare tab text;begin foreach tab in array array['table_checks','check_settlements'] loop
 execute format('alter table public.%I enable row level security',tab);
 execute format('alter table public.%I force row level security',tab);
 execute format('revoke all on public.%I from public,anon,authenticated',tab);
 execute format('grant select on public.%I to authenticated',tab);
 execute format('create policy member_read on public.%I for select to authenticated using(private.has_role(tenant_id,array[''owner'',''staff'']))',tab);
 end loop;end $$;
grant select,insert on public.table_checks to service_role;
grant select on public.check_settlements to service_role;
-- Settlements are append-only, including through accidental privileged updates.
create function private.immutable_settlement() returns trigger language plpgsql set search_path='' as $$begin raise exception 'SETTLEMENT_IMMUTABLE';end $$;
revoke all on function private.immutable_settlement() from public,anon,authenticated;
create trigger immutable_settlement before update or delete on public.check_settlements for each row execute function private.immutable_settlement();
-- Authenticated read model: totals come from immutable order snapshots in PostgreSQL.
create function public.read_table_checks(target_tenant uuid,target_check uuid default null,history boolean default false,before_time timestamptz default null,before_id uuid default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not private.has_role(target_tenant,array['owner','staff']) then raise exception 'ACCESS_DENIED' using errcode='42501';end if;
 if target_check is not null then
  select to_jsonb(c)||jsonb_build_object('table_name',d.name,'total_minor',coalesce(c.settled_total_minor,(select coalesce(sum(o.total_minor),0) from public.orders o where o.tenant_id=c.tenant_id and o.check_id=c.id and o.status not in('rejected','cancelled'))),
  'orders',coalesce((select jsonb_agg(to_jsonb(o)||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.order_items i where i.tenant_id=o.tenant_id and i.order_id=o.id)) order by o.created_at,o.id) from public.orders o where o.tenant_id=c.tenant_id and o.check_id=c.id),'[]'::jsonb),
  'settlements',coalesce((select jsonb_agg(to_jsonb(s)) from public.check_settlements s where s.tenant_id=c.tenant_id and s.check_id=c.id),'[]'::jsonb)) into result
  from public.table_checks c join public.dining_tables d on d.tenant_id=c.tenant_id and d.id=c.table_id where c.tenant_id=target_tenant and c.id=target_check;
  return result;
 elsif history then
  select coalesce(jsonb_agg(to_jsonb(x) order by x.opened_at desc,x.id desc),'[]'::jsonb) into result from
  (select c.*,d.name as table_name from public.table_checks c join public.dining_tables d on d.tenant_id=c.tenant_id and d.id=c.table_id where c.tenant_id=target_tenant and c.state='closed' and (before_time is null or (c.opened_at,c.id)<(before_time,before_id)) order by c.opened_at desc,c.id desc limit 50) x;
  return result;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'active',d.active,'check_id',c.id,'version',c.version,'currency',t.currency,'payment_status',c.payment_status,
 'total_minor',(select coalesce(sum(o.total_minor),0) from public.orders o where o.tenant_id=d.tenant_id and o.check_id=c.id and o.status not in('rejected','cancelled')),
 'active_orders',(select count(*) from public.orders o where o.tenant_id=d.tenant_id and o.check_id=c.id and o.status not in('served','rejected','cancelled'))) order by d.name,d.id),'[]'::jsonb) into result
 from public.dining_tables d join public.tenants t on t.id=d.tenant_id left join public.table_checks c on c.tenant_id=d.tenant_id and c.table_id=d.id and c.state='open' where d.tenant_id=target_tenant;
 return result;
end $$;
revoke all on function public.read_table_checks(uuid,uuid,boolean,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.read_table_checks(uuid,uuid,boolean,timestamptz,uuid) to authenticated;


create or replace function public.create_guest_order(guest_hash text, idem_key text, payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare g public.guest_sessions; d public.dining_tables; s public.tenant_settings; t public.tenants;
 rec public.idempotency_records; item jsonb; p public.products; oid uuid:=gen_random_uuid(); total bigint:=0; status text; fingerprint text:=encode(sha256(convert_to(payload::text,'UTF8')),'hex');
begin
 if length(idem_key) not between 1 and 200 or idem_key is null then raise exception 'INVALID_INPUT'; end if;
 select dt.* into d from public.dining_tables dt join public.guest_sessions gs on gs.tenant_id=dt.tenant_id and gs.table_id=dt.id where gs.session_hash=guest_hash for update of dt;
 select * into g from public.guest_sessions where session_hash=guest_hash for update;
 if not found or g.revoked_at is not null or g.expires_at<=now() or not exists(select 1 from public.table_qr_tokens q where q.tenant_id=g.tenant_id and q.table_id=g.table_id and q.version=g.qr_version and q.revoked_at is null) then raise exception 'SESSION_REQUIRED'; end if;
 if payload->>'session_id' is distinct from g.id::text then raise exception 'SESSION_REQUIRED'; end if;
 select * into rec from public.idempotency_records where tenant_id=g.tenant_id and guest_session_id=g.id and key=idem_key;
 if found then
  if rec.request_hash<>fingerprint then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return jsonb_build_object('replayed',true,'order',public.guest_order(guest_hash,rec.order_id));
 end if;
 if g.visit_version<>d.visit_version then raise exception 'SESSION_REQUIRED';end if;
 if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'INVALID_INPUT'; end if;
 if jsonb_array_length(payload->'items') not between 1 and 30 or length(coalesce(payload->>'note',''))>500 or (payload->>'version') is null then raise exception 'INVALID_INPUT'; end if;
 if (select count(distinct x->>'product_id') from jsonb_array_elements(payload->'items') x)<>jsonb_array_length(payload->'items') then raise exception 'INVALID_INPUT'; end if;
 -- Lock menu rows before settings, matching menu change triggers. A concurrent edit
 -- either precedes validation or waits until the immutable snapshots are written.
 perform 1 from public.categories where tenant_id=g.tenant_id order by id for share;
 perform 1 from public.products where tenant_id=g.tenant_id and id in(select (x->>'product_id')::uuid from jsonb_array_elements(payload->'items') x) order by id for share;
 select * into s from public.tenant_settings where tenant_id=g.tenant_id for share;
 select * into t from public.tenants where id=g.tenant_id for share;
 if not d.active or not t.active or not s.ordering_enabled or not s.menu_published then raise exception 'ORDERING_CLOSED'; end if;
 if s.menu_version<>(payload->>'version')::bigint then raise exception 'MENU_CHANGED'; end if;
 if (select count(*) from public.orders where tenant_id=g.tenant_id and guest_session_id=g.id and created_at>now()-interval '1 minute')>=3 then raise exception 'RATE_LIMIT'; end if;
 if (select count(*) from public.orders where tenant_id=g.tenant_id and table_id=g.table_id and created_at>now()-interval '1 minute')>=30 then raise exception 'RATE_LIMIT'; end if;
 for item in select value from jsonb_array_elements(payload->'items') loop
  if jsonb_typeof(item->'quantity') is distinct from 'number' or (item->>'quantity') !~ '^[0-9]+$' or (item->>'quantity')::int not between 1 and 20 then raise exception 'INVALID_INPUT'; end if;
  select * into p from public.products where tenant_id=g.tenant_id and id=(item->>'product_id')::uuid and available and archived_at is null and exists(select 1 from public.categories c where c.tenant_id=g.tenant_id and c.id=category_id and c.archived_at is null);
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  total:=total+p.price_minor::bigint*(item->>'quantity')::int;
 end loop;
 if total>2147483647 then raise exception 'INVALID_INPUT'; end if;
 status:=case when s.acceptance_mode='automatic' then 'accepted' else 'pending_acceptance' end;
 insert into public.orders(tenant_id,id,table_id,guest_session_id,status,total_minor,currency,acceptance_mode,note) values(g.tenant_id,oid,g.table_id,g.id,status,total,t.currency,s.acceptance_mode,coalesce(payload->>'note',''));
 insert into public.order_items(tenant_id,order_id,product_id,product_name,unit_price_minor,quantity)
 select g.tenant_id,oid,prod.id,prod.name,prod.price_minor,(x->>'quantity')::int from jsonb_array_elements(payload->'items') x join public.products prod on prod.tenant_id=g.tenant_id and prod.id=(x->>'product_id')::uuid;
 insert into public.order_events(tenant_id,order_id,to_status) values(g.tenant_id,oid,status);
 insert into public.idempotency_records(tenant_id,guest_session_id,key,request_hash,order_id,expires_at) values(g.tenant_id,g.id,idem_key,fingerprint,oid,now()+interval '24 hours');
 return jsonb_build_object('replayed',false,'order',public.guest_order(guest_hash,oid));
end $$;

commit;
