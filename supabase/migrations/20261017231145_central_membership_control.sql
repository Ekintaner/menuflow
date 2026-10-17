begin;
-- Only the platform service boundary may grant, change or revoke memberships.
revoke insert(tenant_id,user_id,role,active),update(active),delete on public.memberships from authenticated;
revoke insert,update,delete on public.memberships from anon,authenticated;
drop policy if exists owner_add_staff on public.memberships;
drop policy if exists owner_change_staff on public.memberships;
drop policy if exists owner_remove_staff on public.memberships;

create function public.platform_membership(operation text, actor uuid, target_tenant uuid, target_user uuid,
 member_role text default null, member_active boolean default true)
returns uuid language plpgsql security invoker set search_path='' as $$
declare result_id uuid; previous_role text; previous_active boolean; owners integer;
begin
 if actor is null or target_user is null then raise exception 'invalid input' using errcode='22023'; end if;
 perform 1 from public.tenants where id=target_tenant and active for update;
 if not found then raise exception 'not found' using errcode='P0002'; end if;
 select id,role,active into result_id,previous_role,previous_active from public.memberships
  where tenant_id=target_tenant and user_id=target_user;
 if operation not in ('grant','set_active') or operation is null then raise exception 'invalid operation' using errcode='22023'; end if;
 if operation='grant' and (member_role is null or member_role not in ('owner','staff')) then raise exception 'invalid role' using errcode='22023'; end if;
 if member_active is null then raise exception 'invalid active' using errcode='22023'; end if;
 select count(*) into owners from public.memberships where tenant_id=target_tenant and role='owner' and active;
 if previous_role='owner' and previous_active and owners<=1 and
   ((operation='grant' and member_role<>'owner') or not member_active) then
  raise exception 'LAST_OWNER' using errcode='23514'; end if;
 if operation='grant' then
  insert into public.memberships(tenant_id,user_id,role,active) values(target_tenant,target_user,member_role,member_active)
  on conflict(tenant_id,user_id) do update set role=excluded.role,active=excluded.active returning id into result_id;
 else
  if result_id is null then raise exception 'not found' using errcode='P0002'; end if;
  update public.memberships set active=member_active where tenant_id=target_tenant and user_id=target_user;
 end if;
 insert into public.audit_logs(tenant_id,actor_id,action,target_id)
 values(target_tenant,actor,'platform:membership:'||operation,result_id);
 return result_id;
end $$;
revoke all on function public.platform_membership(text,uuid,uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.platform_membership(text,uuid,uuid,uuid,text,boolean) to service_role;
grant select,insert,update on public.memberships to service_role;
commit;
