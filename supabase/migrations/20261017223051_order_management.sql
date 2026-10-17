begin;
-- CODEX-005: scope schema diff to order management; preserve existing extensions.
-- Orders/events remain read-only to authenticated users outside the narrow RPC.


CREATE INDEX orders_history ON public.orders USING btree (tenant_id, created_at DESC, id DESC);

CREATE INDEX orders_table_history ON public.orders USING btree (tenant_id, table_id, created_at DESC, id DESC);

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION private.order_settings_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 new.version=old.version+1;
 if new.acceptance_mode is distinct from old.acceptance_mode or new.ordering_enabled is distinct from old.ordering_enabled then
  insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(new.tenant_id,auth.uid(),'ordering:settings:'||new.acceptance_mode||':'||new.ordering_enabled::text,new.tenant_id);
 end if;
 return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.transition_order(target_tenant uuid, target_order uuid, expected_version integer, target_status text, supplied_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; member public.memberships;
begin
 select * into member from public.memberships where tenant_id=target_tenant and user_id=auth.uid() and active and role in ('owner','staff') for share;
 if auth.uid() is null or not found or not exists(select 1 from public.tenants where id=target_tenant and active) then raise exception 'ACCESS_DENIED' using errcode='42501'; end if;
 if expected_version is null or expected_version<1 or expected_version>=2147483647 or target_status is null or target_status not in ('accepted','preparing','ready','served','rejected','cancelled') or length(coalesce(supplied_reason,''))>500 or (target_status in ('rejected','cancelled') and length(trim(coalesce(supplied_reason,'')))=0) then raise exception 'INVALID_INPUT'; end if;
 select * into o from public.orders where tenant_id=target_tenant and id=target_order for update;
 if not found then raise exception 'ORDER_NOT_FOUND'; end if;
 if o.version<>expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if not ((o.status='pending_acceptance' and target_status in ('accepted','rejected','cancelled')) or (o.status='accepted' and target_status in ('preparing','cancelled')) or (o.status='preparing' and target_status in ('ready','cancelled')) or (o.status='ready' and target_status in ('served','cancelled'))) then raise exception 'INVALID_TRANSITION'; end if;
 update public.orders set status=target_status,version=version+1 where tenant_id=target_tenant and id=target_order;
 insert into public.order_events(tenant_id,order_id,from_status,to_status,actor_id,reason) values(target_tenant,target_order,o.status,target_status,auth.uid(),nullif(trim(supplied_reason),''));
 insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,auth.uid(),'order:'||o.status||':'||target_status,target_order);
 return jsonb_build_object('id',target_order,'status',target_status,'version',o.version+1);
end $function$
;

CREATE OR REPLACE FUNCTION public.transition_order(target_tenant uuid, target_order uuid, expected_version integer, target_status text, supplied_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO ''
AS $function$ select private.transition_order(target_tenant,target_order,expected_version,target_status,supplied_reason) $function$
;

CREATE TRIGGER order_settings_changed BEFORE UPDATE ON public.tenant_settings FOR EACH ROW EXECUTE FUNCTION private.order_settings_changed();



-- Schema diff tools do not preserve function ACLs: explicitly constrain every entrypoint.
revoke all on function private.order_settings_changed() from public,anon,authenticated,service_role;
revoke all on function private.transition_order(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function private.transition_order(uuid,uuid,integer,text,text) to authenticated;
revoke all on function public.transition_order(uuid,uuid,integer,text,text) from public,anon,authenticated,service_role;
grant execute on function public.transition_order(uuid,uuid,integer,text,text) to authenticated;
commit;
