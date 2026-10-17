begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; raise notice 'PASS: %', label; end $$;
create function pg_temp.denied(query text, expected text) returns void language plpgsql as $$
begin
 begin execute query; exception when others then
 if sqlstate=expected then raise notice 'PASS denied (%): %',expected,query; return; end if;
 raise;
 end;
 raise exception 'FAIL expected denial (%): %',expected,query;
end $$;
insert into auth.users select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid from generate_series(1,5) i;
insert into tenants(id,name,slug) values
 ('10000000-0000-0000-0000-000000000001','A','a'),('20000000-0000-0000-0000-000000000002','B','b');
insert into memberships(tenant_id,user_id,role) values
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','owner'),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','owner'),
 ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003','staff');
insert into tenant_settings(tenant_id) select id from tenants;
insert into dining_tables(tenant_id,id,name) select id,id,'Table 1' from tenants;
insert into categories(tenant_id,id,name) select id,id,name from tenants;
insert into products(tenant_id,id,category_id,name,price_minor) select id,id,id,name,100 from tenants;
insert into table_qr_tokens(tenant_id,id,table_id,token_hash,version) select id,id,id,repeat(left(slug,1),64),1 from tenants;
insert into guest_sessions(tenant_id,id,table_id,qr_version,session_hash,expires_at) select id,id,id,1,repeat(case when slug='a' then 'c' else 'd' end,64),now()+interval '4 hours' from tenants;
insert into orders(tenant_id,id,table_id,guest_session_id,status,total_minor,currency,acceptance_mode) select id,id,id,id,'pending_acceptance',100,'TRY','manual' from tenants;
insert into order_items(tenant_id,order_id,product_id,product_name,unit_price_minor,quantity) select id,id,id,name,100,1 from tenants;
insert into order_events(tenant_id,order_id,to_status) select id,id,'pending_acceptance' from tenants;
insert into idempotency_records(tenant_id,guest_session_id,key,request_hash,order_id,expires_at) select id,id,'test',repeat('e',64),id,now()+interval '24 hours' from tenants;
insert into audit_logs(tenant_id,action) select id,'fixture' from tenants;
select pg_temp.assert((select count(*)=13 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity),'all 13 tables force RLS');
-- FK checks run as superuser, so RLS cannot mask a missing constraint.
select pg_temp.denied($q$insert into products(tenant_id,category_id,name,price_minor) values('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','bad',1)$q$,'23503');
select pg_temp.denied($q$update orders set table_id='20000000-0000-0000-0000-000000000002' where tenant_id='10000000-0000-0000-0000-000000000001'$q$,'23503');
select pg_temp.denied($q$update order_items set product_id='20000000-0000-0000-0000-000000000002' where tenant_id='10000000-0000-0000-0000-000000000001'$q$,'P0001');
select pg_temp.denied($q$update order_items set quantity=0$q$,'P0001');
-- Exercise every tenant relationship under a privileged role: RLS cannot hide FK failures.
do $$ declare fk record; begin
 for fk in select c.conrelid::regclass as child, a.attname as col
 from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[2]
 where c.contype='f' and c.connamespace='public'::regnamespace and array_length(c.conkey,1)>=2 loop
 perform pg_temp.denied(format('update %s set %I=%L where tenant_id=%L',fk.child,fk.col,
 '20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001'),case when fk.child::text='order_items' then 'P0001' else '23503' end);
 end loop;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare tab text; n int; begin
 foreach tab in array array['tenants','tenant_settings','dining_tables','categories','products','orders','order_items','order_events','audit_logs'] loop
 execute format('select count(*) from public.%I',tab) into n;
 if tab='audit_logs' then
 perform pg_temp.assert(n>=1 and not exists(select 1 from audit_logs where tenant_id<>'10000000-0000-0000-0000-000000000001'),'owner A audit isolation');
 else perform pg_temp.assert(n=1,'owner A only sees A: '||tab); end if;
 end loop;
 foreach tab in array array['table_qr_tokens','guest_sessions','idempotency_records'] loop
 perform pg_temp.denied(format('select * from public.%I',tab),'42501');
 end loop;
 foreach tab in array array['orders','order_items','order_events','audit_logs'] loop
 perform pg_temp.denied(format('delete from public.%I',tab),'42501');
 end loop;
end $$;
select pg_temp.assert((select count(*)=2 from memberships),'A memberships only');
insert into categories(tenant_id,name) values('10000000-0000-0000-0000-000000000001','allowed');
delete from categories where name='allowed';
select pg_temp.denied($q$insert into categories(tenant_id,name) values('20000000-0000-0000-0000-000000000002','forbidden')$q$,'42501');
select pg_temp.denied($q$update categories set tenant_id='20000000-0000-0000-0000-000000000002'$q$,'42501');
update products set name='attacked' where tenant_id='20000000-0000-0000-0000-000000000002';
delete from categories where tenant_id='20000000-0000-0000-0000-000000000002';
select pg_temp.denied($q$insert into memberships(tenant_id,user_id,role) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','owner')$q$,'42501');
select pg_temp.denied($q$update memberships set role='owner'$q$,'42501');
update tenant_settings set ordering_enabled=true;
select pg_temp.assert((select ordering_enabled from tenant_settings),'owner settings allowed');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
select pg_temp.assert((select count(*)=1 and min(name)='B' from products),'B only sees unchanged B');
select pg_temp.assert((select count(*)=1 from categories),'B category not deleted');
select pg_temp.assert((select not ordering_enabled from tenant_settings),'A cannot alter B settings');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=1 from orders),'staff reads own orders');
do $$ declare tab text; n int; begin
 foreach tab in array array['categories','products','dining_tables'] loop
 execute format('update %I set name=%L',tab,'forbidden') ;
 get diagnostics n = row_count;
 perform pg_temp.assert(n=0,'staff update denied: '||tab);
 execute format('delete from %I',tab);
 get diagnostics n = row_count;
 perform pg_temp.assert(n=0,'staff delete denied: '||tab);
 end loop;
end $$;
select pg_temp.denied($q$insert into products(tenant_id,category_id,name,price_minor) values('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','bad',1)$q$,'42501');
update tenant_settings set ordering_enabled=false;
select pg_temp.assert((select ordering_enabled from tenant_settings),'staff cannot edit settings');
select pg_temp.denied($q$insert into memberships(tenant_id,user_id,role) values('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005','staff')$q$,'42501');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
update memberships set active=false where user_id='00000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
select pg_temp.assert((select count(*)=0 from orders),'revocation effective without refreshing JWT');
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000005',true);
select set_config('request.jwt.claims','{"user_metadata":{"role":"owner","tenant_id":"10000000-0000-0000-0000-000000000001"}}',true);
select pg_temp.assert((select count(*)=0 from tenants),'forged metadata grants no access');
select set_config('request.jwt.claim.sub','',true);
select pg_temp.assert((select count(*)=0 from tenants),'missing identity fails closed');
reset role;
set local role anon;
do $$ declare tab text; begin
 foreach tab in array array['tenants','memberships','tenant_settings','dining_tables','table_qr_tokens','guest_sessions','categories','products','orders','order_items','order_events','idempotency_records','audit_logs'] loop
 perform pg_temp.denied(format('select * from public.%I',tab),'42501');
 perform pg_temp.denied(format('delete from public.%I',tab),'42501');
 perform pg_temp.denied(format('insert into public.%I default values',tab),'42501');
 perform pg_temp.denied(format('update public.%I set %I=null',tab,case when tab='tenants' then 'id' else 'tenant_id' end),'42501');
 end loop;
end $$;
reset role;
rollback;
