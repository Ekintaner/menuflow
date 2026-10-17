begin;
-- Server-only, transactional provisioning. No SECURITY DEFINER and no browser grant.
create or replace function public.platform_provision(operation text, actor uuid, target_tenant uuid default null,
 restaurant_name text default null, restaurant_slug text default null, owner_user uuid default null,
 table_count integer default null, target_table uuid default null, supplied_hash text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; n integer; existing integer; next_version integer;
begin
 -- The authenticated actor comes from Worker getUser; audit_logs FK validates existence.
 if actor is null then
  raise exception 'invalid actor' using errcode='22023'; end if;
 if operation='create' then
  if table_count is null or table_count not between 1 and 100 or owner_user is null then
   raise exception 'invalid input' using errcode='22023'; end if;
  insert into public.tenants(name,slug) values(restaurant_name,restaurant_slug) returning id into result_id;
  insert into public.tenant_settings(tenant_id) values(result_id);
  insert into public.memberships(tenant_id,user_id,role) values(result_id,owner_user,'owner');
  insert into public.dining_tables(tenant_id,name) select result_id,'Masa '||i from generate_series(1,table_count) i;
  insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(result_id,actor,'platform:restaurant:create',result_id);
 elsif operation='add_tables' then
  perform 1 from public.tenants where id=target_tenant and active for update;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  select count(*) into existing from public.dining_tables where tenant_id=target_tenant;
  if table_count is null or table_count not between 1 and 100 or existing+table_count>100 then
   raise exception 'table limit' using errcode='22023'; end if;
  n:=1;
  for i in 1..table_count loop
   while exists(select 1 from public.dining_tables where tenant_id=target_tenant and name='Masa '||n) loop n:=n+1; end loop;
   insert into public.dining_tables(tenant_id,name) values(target_tenant,'Masa '||n);
  end loop;
  result_id:=target_tenant;
  insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,actor,'platform:tables:add',target_tenant);
 elsif operation='rotate_qr' then
  if supplied_hash is null or supplied_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid hash' using errcode='22023'; end if;
  perform 1 from public.dining_tables d join public.tenants t on t.id=d.tenant_id
   where d.tenant_id=target_tenant and d.id=target_table and d.active and t.active for update of d;
  if not found then raise exception 'not found' using errcode='P0002'; end if;
  select coalesce(max(version),0)+1 into next_version from public.table_qr_tokens where tenant_id=target_tenant and table_id=target_table;
  update public.table_qr_tokens set revoked_at=now() where tenant_id=target_tenant and table_id=target_table and revoked_at is null;
  update public.guest_sessions set revoked_at=now() where tenant_id=target_tenant and table_id=target_table and revoked_at is null;
  insert into public.table_qr_tokens(tenant_id,table_id,token_hash,version) values(target_tenant,target_table,supplied_hash,next_version);
  insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,actor,'platform:qr:rotate',target_table);
  result_id:=target_table;
 else raise exception 'invalid operation' using errcode='22023'; end if;
 return result_id;
end $$;
revoke all on function public.platform_provision(text,uuid,uuid,text,text,uuid,integer,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_provision(text,uuid,uuid,text,text,uuid,integer,uuid,text) to service_role;
-- Required by the invoker function; the service key remains server-only.
grant select,insert on public.tenants,public.memberships,public.dining_tables,public.tenant_settings,public.audit_logs to service_role;
grant select,insert,update on public.table_qr_tokens to service_role;
grant select,update on public.guest_sessions to service_role;
commit;
