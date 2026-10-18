begin;
create table public.registration_requests (
 id uuid primary key default gen_random_uuid(),applicant_name text not null check(length(applicant_name) between 1 and 120),
 email text not null check(email=lower(email) and length(email)<=254),business_name text not null check(length(business_name) between 1 and 120),
 phone text check(length(phone)<=32),status text not null default 'pending' check(status in('pending','processing','approved','rejected','activated')),
 created_at timestamptz not null default now(),reviewed_at timestamptz,reviewed_by uuid references auth.users(id),reason text check(length(reason)<=500),
 claim_id uuid,claim_expires_at timestamptz,user_id uuid references auth.users(id),tenant_id uuid references public.tenants(id),version integer not null default 1
);
create unique index registration_one_pending_email on public.registration_requests(email) where status in('pending','processing','approved');
create index registration_queue on public.registration_requests(status,created_at,id);
create index registration_user on public.registration_requests(user_id);
create index registration_tenant on public.registration_requests(tenant_id);
create index registration_reviewer on public.registration_requests(reviewed_by);
create table public.platform_audit_logs (
 id uuid primary key default gen_random_uuid(),actor_id uuid not null references auth.users(id),action text not null,target_id uuid not null,reason text check(length(reason)<=500),created_at timestamptz not null default now()
);
create index platform_audit_actor on public.platform_audit_logs(actor_id,created_at desc);
alter table public.registration_requests enable row level security;
alter table public.registration_requests force row level security;
alter table public.platform_audit_logs enable row level security;
alter table public.platform_audit_logs force row level security;
revoke all on public.registration_requests,public.platform_audit_logs from public,anon,authenticated;
grant select,insert,update on public.registration_requests to service_role;
grant select,insert on public.platform_audit_logs to service_role;

create function public.review_registration(operation text,target_request uuid,actor uuid,claim uuid,auth_user uuid default null,table_count integer default 4,supplied_reason text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.registration_requests; tid uuid;
begin
 if actor is null or claim is null then raise exception 'INVALID_INPUT';end if;
 select * into r from public.registration_requests where id=target_request for update;
 if not found then raise exception 'NOT_FOUND';end if;
 if operation='claim' then
  if r.status<>'pending' and not(r.status='processing' and r.claim_expires_at<now()) then raise exception 'REVIEW_CONFLICT';end if;
  update public.registration_requests set status='processing',claim_id=claim,claim_expires_at=now()+interval '5 minutes',reviewed_by=actor,version=version+1 where id=r.id returning * into r;
 elsif operation='release' then
  if r.status='processing' and r.claim_id=claim and r.reviewed_by=actor then
   update public.registration_requests set status='pending',claim_id=null,claim_expires_at=null,version=version+1 where id=r.id returning * into r;
  end if;
 elsif operation in('approve','reject') then
  if r.status<>'processing' or r.claim_id<>claim or r.reviewed_by<>actor or r.claim_expires_at<now() then raise exception 'REVIEW_CONFLICT';end if;
  if operation='approve' then
   if auth_user is null or auth_user=actor or table_count is null or table_count not between 1 and 100 then raise exception 'INVALID_INPUT';end if;
   insert into public.tenants(name,slug) values(r.business_name,'basvuru-'||replace(r.id::text,'-','')) returning id into tid;
   insert into public.tenant_settings(tenant_id) values(tid);
   insert into public.memberships(tenant_id,user_id,role,active) values(tid,auth_user,'owner',false);
   insert into public.dining_tables(tenant_id,name) select tid,'Masa '||i from generate_series(1,table_count) i;
   update public.registration_requests set status='approved',user_id=auth_user,tenant_id=tid,reviewed_at=now(),claim_id=null,claim_expires_at=null,version=version+1 where id=r.id returning * into r;
  else
   if length(trim(coalesce(supplied_reason,''))) not between 1 and 500 then raise exception 'INVALID_INPUT';end if;
   update public.registration_requests set status='rejected',reason=trim(supplied_reason),reviewed_at=now(),claim_id=null,claim_expires_at=null,version=version+1 where id=r.id returning * into r;
  end if;
  insert into public.platform_audit_logs(actor_id,action,target_id) values(actor,'registration:'||operation,r.id);
 else raise exception 'INVALID_INPUT';end if;
 return to_jsonb(r);
end $$;
revoke all on function public.review_registration(text,uuid,uuid,uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.review_registration(text,uuid,uuid,uuid,uuid,integer,text) to service_role;
create function public.activate_registration(auth_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.registration_requests; n integer:=0;
begin
 for r in select * from public.registration_requests where user_id=auth_user and status='approved' order by id for update loop
  update public.memberships set active=true where tenant_id=r.tenant_id and user_id=auth_user and role='owner';
  if not found then raise exception 'MEMBERSHIP_REQUIRED';end if;
  update public.registration_requests set status='activated',version=version+1 where id=r.id;
  insert into public.platform_audit_logs(actor_id,action,target_id) values(auth_user,'registration:activate',r.id);n:=n+1;
 end loop;
 return jsonb_build_object('activated',n);
end $$;
revoke all on function public.activate_registration(uuid) from public,anon,authenticated;
grant execute on function public.activate_registration(uuid) to service_role;
create function public.platform_restaurant_state(target_tenant uuid,actor uuid,enabled boolean,supplied_reason text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if enabled is null or actor is null or length(trim(coalesce(supplied_reason,''))) not between 1 and 500 then raise exception 'INVALID_INPUT';end if;
 update public.tenants set active=enabled where id=target_tenant;
 if not found then raise exception 'NOT_FOUND';end if;
 insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,actor,'platform:restaurant:active:'||enabled::text,target_tenant);
 insert into public.platform_audit_logs(actor_id,action,target_id,reason) values(actor,'restaurant:active:'||enabled::text,target_tenant,trim(supplied_reason));
end $$;
revoke all on function public.platform_restaurant_state(uuid,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.platform_restaurant_state(uuid,uuid,boolean,text) to service_role;
-- Preserve the existing restaurant/table/QR/membership audit events in the
-- platform-wide feed as well. Invoker execution retains the original RPC role.
create function private.capture_platform_audit() returns trigger language plpgsql security invoker set search_path='' as $$
begin insert into public.platform_audit_logs(actor_id,action,target_id) values(new.actor_id,new.action,new.target_id);return new;end $$;
revoke all on function private.capture_platform_audit() from public,anon,authenticated;
create trigger capture_platform_audit after insert on public.audit_logs for each row
when(new.action like 'platform:%' and new.action not like 'platform:restaurant:active:%') execute function private.capture_platform_audit();
insert into public.platform_audit_logs(actor_id,action,target_id,created_at)
 select actor_id,action,target_id,created_at from public.audit_logs where action like 'platform:%' and actor_id is not null and target_id is not null;
commit;
