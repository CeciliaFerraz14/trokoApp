-- =============================================================================
-- Troko Bloco · Migración 0028 · Los admins cambian la foto de los grupos
-- Bucket público 'groups' (los logos no son datos personales), ruta
-- groups/<group_id>/<nombre>.jpg; solo los admins suben, cambian o borran.
-- groups.image admite ahora, además de los logos de la app (/groups/…), la
-- URL pública de una foto de ese bucket.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('groups', 'groups', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "groups: ver fotos"
  on storage.objects for select to authenticated
  using (bucket_id = 'groups');

create policy "groups: subir fotos (admin)"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'groups' and public.is_admin());

create policy "groups: cambiar fotos (admin)"
  on storage.objects for update to authenticated
  using (bucket_id = 'groups' and public.is_admin());

create policy "groups: borrar fotos (admin)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'groups' and public.is_admin());

alter table public.groups drop constraint image_path;
alter table public.groups add constraint image_path check (
  image ~ '^/groups/[a-z0-9_-]+\.(png|webp|jpg)$'
  or image ~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/groups/[0-9a-f-]{36}/[a-z0-9_-]+\.(png|webp|jpg)$'
);
