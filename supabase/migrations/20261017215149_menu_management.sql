begin;
alter table public.products add column sort_order integer not null default 0;
alter table public.products add constraint image_tenant_path check (image_path is null or image_path ~ ('^' || tenant_id::text || '/' || id::text || '/[0-9a-f-]+\.(png|jpg|webp)$'));
-- Publication is explicit: creating/editing menu data does not expose it until published.
alter table public.tenant_settings add column menu_published boolean not null default false;
alter table public.tenant_settings add column menu_version bigint not null default 1;
grant update(menu_published) on public.tenant_settings to authenticated;
create function private.menu_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.tenant_settings set menu_version=menu_version+1 where tenant_id=coalesce(new.tenant_id,old.tenant_id);
 insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(coalesce(new.tenant_id,old.tenant_id),auth.uid(),tg_table_name||':'||tg_op,coalesce(new.id,old.id));
 return coalesce(new,old);
end $$;
revoke all on function private.menu_changed() from public,anon,authenticated;
create trigger menu_changed after insert or update or delete on public.products for each row execute function private.menu_changed();
create trigger menu_changed after insert or update or delete on public.categories for each row execute function private.menu_changed();
create trigger table_changed after insert or update on public.dining_tables for each row execute function private.menu_changed();
create function private.publication_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.menu_published is distinct from old.menu_published then
  new.menu_version=old.menu_version+1;
  insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(new.tenant_id,auth.uid(),'menu:publish:'||new.menu_published::text,new.tenant_id);
 end if;
 return new;
end $$;
revoke all on function private.publication_changed() from public,anon,authenticated;
create trigger publication_changed before update on public.tenant_settings for each row execute function private.publication_changed();
create trigger membership_changed after insert or update or delete on public.memberships for each row execute function private.menu_changed();
-- Narrow RPC: explicit owner check, serialized rotation, no raw tokens accepted or returned.
create function private.rotate_table_qr(target_tenant uuid,target_table uuid,supplied_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare next_version integer;
begin
 if not private.has_role(target_tenant,array['owner']) then raise exception 'owner required' using errcode='42501'; end if;
 perform 1 from public.dining_tables where tenant_id=target_tenant and id=target_table and active for update;
 if not found then raise exception 'active table required'; end if;
 select coalesce(max(version),0)+1 into next_version from public.table_qr_tokens where tenant_id=target_tenant and table_id=target_table;
 update public.table_qr_tokens set revoked_at=now() where tenant_id=target_tenant and table_id=target_table and revoked_at is null;
 update public.guest_sessions set revoked_at=now() where tenant_id=target_tenant and table_id=target_table and revoked_at is null;
 insert into public.table_qr_tokens(tenant_id,table_id,token_hash,version) values(target_tenant,target_table,supplied_hash,next_version);
 insert into public.audit_logs(tenant_id,actor_id,action,target_id) values(target_tenant,auth.uid(),'qr:rotate',target_table);
end $$;
revoke all on function private.rotate_table_qr(uuid,uuid,text) from public,anon,authenticated;
grant execute on function private.rotate_table_qr(uuid,uuid,text) to authenticated;
create function public.rotate_table_qr(target_tenant uuid,target_table uuid,supplied_hash text) returns void
language sql security invoker set search_path='' as $$ select private.rotate_table_qr(target_tenant,target_table,supplied_hash) $$;
revoke all on function public.rotate_table_qr(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rotate_table_qr(uuid,uuid,text) to authenticated;
-- Only the server may resolve a hash. No general elevated table API is exposed.
create function public.read_qr_menu(supplied_hash text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('tenant',jsonb_build_object('name',t.name,'currency',t.currency),'table',jsonb_build_object('name',d.name),
 'version',s.menu_version,'categories',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'sort_order',c.sort_order) order by c.sort_order,c.id) from public.categories c where c.tenant_id=t.id and c.archived_at is null),'[]'::jsonb),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'category_id',p.category_id,'name',p.name,'description',p.description,'price_minor',p.price_minor,'available',p.available,'image_path',p.image_path) order by p.sort_order,p.id) from public.products p join public.categories c on c.tenant_id=p.tenant_id and c.id=p.category_id where p.tenant_id=t.id and p.archived_at is null and c.archived_at is null),'[]'::jsonb))
 from public.table_qr_tokens q join public.dining_tables d on d.tenant_id=q.tenant_id and d.id=q.table_id
 join public.tenants t on t.id=q.tenant_id join public.tenant_settings s on s.tenant_id=t.id
 where q.token_hash=supplied_hash and q.revoked_at is null and d.active and t.active and s.menu_published
$$;
revoke all on function public.read_qr_menu(text) from public,anon,authenticated;
grant execute on function public.read_qr_menu(text) to service_role;
grant select on public.tenants,public.tenant_settings,public.table_qr_tokens,public.dining_tables,public.categories,public.products to service_role;
-- Private images: signed read URLs are issued only after menu/owner authorization.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('menu-images','menu-images',false,307200,array['image/png','image/jpeg','image/webp']);
create policy menu_image_read on storage.objects for select to authenticated
 using(bucket_id='menu-images' and exists(select 1 from public.tenants t where t.id::text=split_part(storage.objects.name,'/',1) and private.has_role(t.id,array['owner'])));
create policy menu_image_insert on storage.objects for insert to authenticated
 with check(bucket_id='menu-images' and exists(select 1 from public.products p where p.tenant_id::text=split_part(storage.objects.name,'/',1) and p.id::text=split_part(storage.objects.name,'/',2) and private.has_role(p.tenant_id,array['owner'])));
create policy menu_image_delete on storage.objects for delete to authenticated
 using(bucket_id='menu-images' and exists(select 1 from public.tenants t where t.id::text=split_part(storage.objects.name,'/',1) and private.has_role(t.id,array['owner'])));
commit;
