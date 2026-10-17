-- Dedicated committed fixtures for parallel connections; container is disposable.
insert into tenants(id,name,slug) values('40000000-0000-0000-0000-000000000001','Orders A','orders-a'),('40000000-0000-0000-0000-000000000002','Orders B','orders-b');
insert into tenant_settings(tenant_id,menu_published,ordering_enabled) select id,true,true from tenants;
insert into dining_tables(tenant_id,id,name) select id,id,'Table' from tenants;
insert into categories(tenant_id,id,name) select id,id,'Menu' from tenants;
insert into products(tenant_id,id,category_id,name,price_minor) select id,id,id,'Coffee',1250 from tenants;
insert into table_qr_tokens(tenant_id,table_id,token_hash,version) select id,id,repeat(case when slug='orders-a' then 'a' else 'b' end,64),1 from tenants;
set role service_role;
select open_guest_session(repeat('a',64),repeat('c',64));
select open_guest_session(repeat('a',64),repeat('d',64));
select open_guest_session(repeat('b',64),repeat('e',64));
reset role;
create function public.test_assert(ok boolean,label text) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end $$;
create function public.test_error(query text,expected text) returns void language plpgsql as $$ begin begin execute query; exception when others then if sqlerrm=expected or sqlstate=expected then raise notice 'PASS denied: %',expected; return; end if; raise; end; raise exception 'FAIL expected: %',expected; end $$;
create function public.test_payload(product uuid default '40000000-0000-0000-0000-000000000001',quantity integer default 2) returns jsonb language sql as $$ select jsonb_build_object('session_id',(select id from guest_sessions where session_hash=repeat('c',64)),'version',(select menu_version from tenant_settings where tenant_id='40000000-0000-0000-0000-000000000001'),'note','test','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',quantity))) $$;
-- Server calls have no access to this helper; payload is built by superuser then used under service role in the harness.
select test_assert(not has_function_privilege('anon','create_guest_order(text,text,jsonb)','execute'),'anonymous RPC denied');
select test_assert(not has_function_privilege('authenticated','guest_order(text,uuid)','execute'),'authenticated guest RPC denied');
select test_error($q$select create_guest_order(repeat('f',64),'bad',test_payload())$q$,'SESSION_REQUIRED');
select test_error($q$select create_guest_order(repeat('c',64),'bad',test_payload('40000000-0000-0000-0000-000000000002'))$q$,'PRODUCT_UNAVAILABLE');
select test_error($q$select create_guest_order(repeat('c',64),'bad',test_payload(quantity=>0))$q$,'INVALID_INPUT');
select test_assert((select count(*)=0 from orders),'invalid request leaves no order');
