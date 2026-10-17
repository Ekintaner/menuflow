begin;
insert into auth.users(id) values('50000000-0000-0000-0000-000000000001'),('50000000-0000-0000-0000-000000000002'),('50000000-0000-0000-0000-000000000003');
insert into memberships(tenant_id,user_id,role) values('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','owner'),('40000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','staff'),('40000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000003','owner');
-- Test every pair, including backwards, skipped, repeated and terminal transitions.
do $$ declare source text; dest text; allowed boolean; oid uuid; event_count int; audit_count int; result jsonb;
begin
 select id into oid from orders where tenant_id='40000000-0000-0000-0000-000000000001' and acceptance_mode='manual' limit 1;
 foreach source in array array['pending_acceptance','accepted','preparing','ready','served','rejected','cancelled'] loop
 foreach dest in array array['accepted','preparing','ready','served','rejected','cancelled'] loop
  update orders set status=source,version=1 where id=oid;
  select count(*) into event_count from order_events;
  select count(*) into audit_count from audit_logs;
  allowed:=(source='pending_acceptance' and dest in ('accepted','rejected','cancelled')) or (source='accepted' and dest in ('preparing','cancelled')) or (source='preparing' and dest in ('ready','cancelled')) or (source='ready' and dest in ('served','cancelled'));
  perform set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
  set local role authenticated;
  if allowed then
   result:=transition_order('40000000-0000-0000-0000-000000000001',oid,1,dest,'test reason');
   perform test_assert(result->>'version'='2','staff allowed '||source||' -> '||dest);
  else
   perform test_error(format('select transition_order(%L,%L,1,%L,%L)','40000000-0000-0000-0000-000000000001',oid,dest,'test reason'),'INVALID_TRANSITION');
  end if;
  reset role;
  perform test_assert((select count(*)=event_count+case when allowed then 1 else 0 end from order_events),'event atomicity '||source||' -> '||dest);
  perform test_assert((select count(*)=audit_count+case when allowed then 1 else 0 end from audit_logs),'audit atomicity '||source||' -> '||dest);
 end loop; end loop;
 update orders set status='pending_acceptance',version=1 where id=oid;
 -- Save fixed identifiers without exposing guest records to authenticated callers.
 perform set_config('test.order',oid::text,true);
end $$;
set local role authenticated;
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'rejected'),'INVALID_INPUT');
select test_error(format('select transition_order(%L,%L,1,%L,%L)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'cancelled','  '),'INVALID_INPUT');
select test_error(format('select transition_order(%L,%L,0,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'accepted'),'INVALID_INPUT');
select test_error(format('select transition_order(%L,%L,2,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'accepted'),'VERSION_CONFLICT');
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000002',current_setting('test.order'),'accepted'),'42501');
select test_error($q$update orders set status='served'$q$,'42501');
select test_error($q$insert into audit_logs(tenant_id,action) values('40000000-0000-0000-0000-000000000001','forged')$q$,'42501');
select test_error($q$delete from order_events$q$,'42501');
select test_assert((select count(*)=0 from orders where tenant_id='40000000-0000-0000-0000-000000000002'),'staff cannot read other tenant orders');
select test_assert((select count(*)=0 from order_events where tenant_id='40000000-0000-0000-0000-000000000002'),'staff cannot read other tenant events');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000003',true);
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000002',current_setting('test.order'),'accepted'),'ORDER_NOT_FOUND');
reset role;
update memberships set active=false where user_id='50000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'accepted'),'42501');
select test_assert((select count(*)=0 from orders),'revoked member cannot read orders');
reset role;
-- Force failure after the status UPDATE: no status, event or audit may survive.
create function public.test_fail_event() returns trigger language plpgsql as $$ begin raise exception 'INJECTED_EVENT_FAILURE'; end $$;
create trigger test_fail_event before insert on order_events for each row execute function test_fail_event();
set local role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000001',true);
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'accepted'),'INJECTED_EVENT_FAILURE');
select test_assert((select status='pending_acceptance' and version=1 from orders where id=current_setting('test.order')::uuid),'event failure rolls back state');
reset role;
drop trigger test_fail_event on order_events;
-- Failure at the final audit write must also undo the already-inserted event.
create trigger test_fail_audit before insert on audit_logs for each row execute function test_fail_event();
select set_config('test.events',(select count(*)::text from order_events),true);
set local role authenticated;
select test_error(format('select transition_order(%L,%L,1,%L,null)','40000000-0000-0000-0000-000000000001',current_setting('test.order'),'accepted'),'INJECTED_EVENT_FAILURE');
reset role;
select test_assert((select status='pending_acceptance' and version=1 from orders where id=current_setting('test.order')::uuid),'audit failure rolls back state');
select test_assert((select count(*)=current_setting('test.events')::int from order_events),'audit failure rolls back event');
drop trigger test_fail_audit on audit_logs;
-- Settings changes cannot rewrite old acceptance snapshots.
set local role authenticated;
update tenant_settings set acceptance_mode='automatic',ordering_enabled=true where tenant_id='40000000-0000-0000-0000-000000000001';
select test_assert((select acceptance_mode='manual' from orders where id=current_setting('test.order')::uuid),'settings preserve old order');
select test_assert(exists(select 1 from audit_logs where action='ordering:settings:automatic:true' and actor_id=auth.uid()),'settings audited with actor');
select set_config('request.jwt.claim.sub','50000000-0000-0000-0000-000000000002',true);
with changed as (update tenant_settings set acceptance_mode='manual' returning *) select test_assert(count(*)=0,'revoked staff cannot change settings') from changed;
reset role;
select test_assert(not has_function_privilege('anon','public.transition_order(uuid,uuid,integer,text,text)','execute'),'anonymous transition denied');
select test_assert(not has_function_privilege('service_role','private.transition_order(uuid,uuid,integer,text,text)','execute'),'server cannot impersonate staff');
rollback;
