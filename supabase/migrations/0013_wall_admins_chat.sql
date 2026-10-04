-- =============================================================================
-- Troko Bloco · Migración 0013 · Muro solo de admins y chat de grupo
--
-- Muro: solo los admins publican (y suben fotos) y comentan. El resto del
-- grupo lo ve y reacciona. Lo que ya estaba publicado se queda; quien lo
-- escribió aún puede editarlo o borrarlo, y la coordinación sigue moderando.
--
-- Chat: cada grupo tiene un chat donde escribe cualquier miembro activo (y
-- los admins): texto, enlaces y fotos. Los mensajes no se editan; los borra
-- quien los escribió o la moderación (coordinación del grupo y admins).
-- Fotos en el bucket PRIVADO "chat": <group_id>/<message_id>/<archivo>.jpg
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Muro: publicar y comentar, solo admins
-- ---------------------------------------------------------------------------
drop policy "posts: publicar" on public.posts;
create policy "posts: publicar (admins)"
  on public.posts for insert to authenticated
  with check (author_id = (select auth.uid()) and public.is_admin());

drop policy "post_comments: comentar" on public.post_comments;
create policy "post_comments: comentar (admins)"
  on public.post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_admin()
    and exists (select 1 from public.posts p where p.id = post_id)
  );

drop policy "wall: subir (miembros del grupo)" on storage.objects;
create policy "wall: subir (admins)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wall'
    and array_length(storage.foldername(name), 1) = 2
    and public.wall_path_group(name) is not null
    and public.is_admin()
  );

-- ---------------------------------------------------------------------------
-- Chat: tablas
-- ---------------------------------------------------------------------------
create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  -- Al borrar una cuenta se van sus mensajes (como su contenido del muro)
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null default '',
  created_at timestamptz not null default now(),
  constraint body_length check (char_length(body) <= 2000)
);
create index chat_messages_group_created_idx on public.chat_messages (group_id, created_at desc);
create index chat_messages_author_idx on public.chat_messages (author_id);

create table public.chat_photos (
  id         uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  path       text not null unique,
  width      int not null check (width > 0),
  height     int not null check (height > 0),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index chat_photos_message_idx on public.chat_photos (message_id, position);
create index chat_photos_group_idx on public.chat_photos (group_id);

-- Autoría, grupo y fecha no se pueden falsear
create or replace function public.chat_messages_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.author_id := auth.uid();
  end if;
  new.created_at := now();
  new.body := trim(new.body);
  return new;
end;
$$;

create trigger chat_messages_before_write
  before insert on public.chat_messages
  for each row execute function public.chat_messages_before_write();

-- Las fotos heredan el grupo de su mensaje
create or replace function public.chat_photos_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select group_id into new.group_id from public.chat_messages where id = new.message_id;
  if new.group_id is null then
    raise exception 'Mensaje no encontrado';
  end if;
  return new;
end;
$$;

create trigger chat_photos_before_write
  before insert on public.chat_photos
  for each row execute function public.chat_photos_before_write();

revoke execute on function public.chat_messages_before_write() from anon, authenticated, public;
revoke execute on function public.chat_photos_before_write()   from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Chat: Row Level Security (sin políticas de update: no se editan)
-- ---------------------------------------------------------------------------
alter table public.chat_messages enable row level security;
alter table public.chat_photos   enable row level security;

create policy "chat_messages: ver"
  on public.chat_messages for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "chat_messages: escribir"
  on public.chat_messages for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (public.is_group_member(group_id) or public.is_admin())
  );

create policy "chat_messages: borrar (autor/a o moderación)"
  on public.chat_messages for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_active())
    or public.can_manage_group(group_id)
  );

create policy "chat_photos: ver"
  on public.chat_photos for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "chat_photos: añadir"
  on public.chat_photos for insert to authenticated
  with check (
    exists (select 1 from public.chat_messages m where m.id = message_id and m.author_id = (select auth.uid()))
    and split_part(path, '/', 1) = group_id::text
    and split_part(path, '/', 2) = message_id::text
  );

-- ---------------------------------------------------------------------------
-- Storage: fotos del chat (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "chat: ver (miembros del grupo)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat'
    and (public.is_group_member(public.wall_path_group(name)) or public.is_admin())
  );

create policy "chat: subir (miembros del grupo)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat'
    and array_length(storage.foldername(name), 1) = 2
    and (public.is_group_member(public.wall_path_group(name)) or public.is_admin())
  );

create policy "chat: borrar (quien subió o moderación)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat'
    and (
      owner_id = (select auth.uid())::text
      or public.can_manage_group(public.wall_path_group(name))
    )
  );

-- ---------------------------------------------------------------------------
-- Borrar cuentas: sus fotos del chat (la app las borra antes que la cuenta;
-- los mensajes se van en cascada con el perfil)
-- ---------------------------------------------------------------------------
create or replace function public.account_chat_files(p_user uuid)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.can_delete_account(p_user) then
    raise exception 'No puedes borrar esta cuenta';
  end if;
  return array(
    select f.path from public.chat_photos f
    join public.chat_messages m on m.id = f.message_id
    where m.author_id = p_user
    union all
    select regexp_replace(f.path, '\.jpg$', '_t.jpg') from public.chat_photos f
    join public.chat_messages m on m.id = f.message_id
    where m.author_id = p_user
  );
end;
$$;

revoke execute on function public.account_chat_files(uuid) from anon, public;
grant execute on function public.account_chat_files(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen de admin: también mensajes y espacio del chat
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver el resumen';
  end if;
  return jsonb_build_object(
    'people', (
      select jsonb_build_object(
        'active',   count(*) filter (where status = 'active'),
        'pending',  count(*) filter (where status = 'pending'),
        'rejected', count(*) filter (where status = 'rejected'),
        'admins',   count(*) filter (where status = 'active' and role = 'admin')
      ) from public.profiles
    ),
    'content', jsonb_build_object(
      'announcements', (select count(*) from public.announcements),
      'events',        (select count(*) from public.events where starts_at >= now()),
      'posts',         (select count(*) from public.posts),
      'photos',        (select count(*) from public.post_photos),
      'comments',      (select count(*) from public.post_comments),
      'messages',      (select count(*) from public.chat_messages)
    ),
    'storage', (
      select jsonb_build_object(
        'wall_bytes',    coalesce(sum((metadata ->> 'size')::bigint) filter (where bucket_id = 'wall'), 0),
        'chat_bytes',    coalesce(sum((metadata ->> 'size')::bigint) filter (where bucket_id = 'chat'), 0),
        'avatars_bytes', coalesce(sum((metadata ->> 'size')::bigint) filter (where bucket_id = 'avatars'), 0)
      ) from storage.objects
    ),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Tiempo real
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.chat_messages, public.chat_photos;
