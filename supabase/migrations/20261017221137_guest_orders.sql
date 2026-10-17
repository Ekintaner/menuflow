begin;
-- All guest RPCs use invoker privileges and are executable only by the server role.
create function public.open_guest_session(qr_hash text, guest_hash text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare q public.table_qr_tokens; d public.dining_tables;
begin
 select dt.* into d from public.dining_tables dt join public.table_qr_tokens qt on qt.tenant_id=dt.tenant_id and qt.table_id=dt.id where qt.token_hash=qr_hash for share of dt;
 if not found or not d.active then return false; end if;
 select * into q from public.table_qr_tokens where token_hash=qr_hash and revoked_at is null for share;
 if not found or not exists(select 1 from public.tenants t join public.tenant_settings s on s.tenant_id=t.id where t.id=q.tenant_id and t.active and s.menu_published) then return false; end if;
 insert into public.guest_sessions(tenant_id,table_id,qr_version,session_hash,expires_at) values(q.tenant_id,q.table_id,q.version,guest_hash,now()+interval '4 hours');
 return true;
end $$;
create function public.guest_menu(guest_hash text) returns jsonb
language sql security invoker set search_path='' as $$
 select public.read_qr_menu(q.token_hash) || jsonb_build_object('ordering_enabled',s.ordering_enabled,'session_id',g.id)
 from public.guest_sessions g join public.table_qr_tokens q on q.tenant_id=g.tenant_id and q.table_id=g.table_id and q.version=g.qr_version
 join public.tenant_settings s on s.tenant_id=g.tenant_id
 where g.session_hash=guest_hash and g.revoked_at is null and g.expires_at>now() and q.revoked_at is null
$$;
create function public.guest_order(guest_hash text, target_order uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object('id',o.id,'number',left(o.id::text,8),'status',o.status,'total_minor',o.total_minor,'currency',o.currency,'version',o.version,'created_at',o.created_at,'note',o.note,
 'items',(select jsonb_agg(jsonb_build_object('product_id',i.product_id,'product_name',i.product_name,'unit_price_minor',i.unit_price_minor,'quantity',i.quantity,'line_total_minor',i.line_total_minor) order by i.product_id) from public.order_items i where i.tenant_id=o.tenant_id and i.order_id=o.id),
 'events',(select jsonb_agg(jsonb_build_object('status',e.to_status,'created_at',e.created_at) order by e.created_at,e.id) from public.order_events e where e.tenant_id=o.tenant_id and e.order_id=o.id))
 from public.orders o join public.guest_sessions g on g.tenant_id=o.tenant_id and g.id=o.guest_session_id
 join public.table_qr_tokens q on q.tenant_id=g.tenant_id and q.table_id=g.table_id and q.version=g.qr_version
 where g.session_hash=guest_hash and g.revoked_at is null and g.expires_at>now() and q.revoked_at is null and o.id=target_order
$$;
create function public.create_guest_order(guest_hash text, idem_key text, payload jsonb) returns jsonb
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
-- Immutable submitted line snapshots, even through a privileged accidental UPDATE.
create function private.immutable_order_item() returns trigger language plpgsql set search_path='' as $$ begin raise exception 'ORDER_ITEMS_IMMUTABLE'; end $$;
revoke all on function private.immutable_order_item() from public,anon,authenticated;
create trigger immutable_order_item before update on public.order_items for each row execute function private.immutable_order_item();
revoke all on function public.open_guest_session(text,text), public.guest_menu(text), public.guest_order(text,uuid), public.create_guest_order(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.open_guest_session(text,text), public.guest_menu(text), public.guest_order(text,uuid), public.create_guest_order(text,text,jsonb) to service_role;
grant select,insert on public.guest_sessions,public.orders,public.order_items,public.order_events,public.idempotency_records to service_role;
-- SELECT FOR UPDATE requires UPDATE privilege; no guest receives the server key.
grant update on public.guest_sessions,public.dining_tables,public.table_qr_tokens,public.categories,public.products,public.tenant_settings,public.tenants to service_role;
commit;
