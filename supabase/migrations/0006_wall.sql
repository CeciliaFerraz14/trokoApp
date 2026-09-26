-- =============================================================================
-- Troko Bloco · Migración 0006 · Muro de grupos
-- Publicaciones con texto, fotos y enlace de vídeo; comentarios; reacciones;
-- galería de fotos; tiempo real.
--
-- - Cada publicación es de UN grupo. La ven y comentan sus miembros (y admins).
-- - Publicar: cualquier miembro activo del grupo, o un admin.
-- - Editar: quien lo escribió. Borrar: quien lo escribió o la moderación
--   (coordinación del grupo y admins), también comentarios.
-- - Fotos en el bucket PRIVADO "wall" (puede haber menores en la escuela):
--   ruta <group_id>/<post_id>/<archivo>.jpg; la app usa URLs firmadas.
-- - Los vídeos se comparten como enlace (sin subir vídeos: 1 GB gratis).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.posts (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null default '',
  video_url  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at  timestamptz,
  constraint body_length check (char_length(body) <= 5000),
  constraint video_url_format check (video_url ~ '^https://[^\s]+$' and char_length(video_url) <= 500)
);
create index posts_group_created_idx on public.posts (group_id, created_at desc);
create index posts_author_idx on public.posts (author_id);

create table public.post_photos (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  path       text not null unique,
  width      int not null check (width > 0),
  height     int not null check (height > 0),
  position   int not null default 0,
  created_at timestamptz not null default now()
);
create index post_photos_post_idx on public.post_photos (post_id, position);
create index post_photos_group_idx on public.post_photos (group_id, created_at desc);

create table public.post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  author_id  uuid references public.profiles (id) on delete set null,
  body       text not null,
  created_at timestamptz not null default now(),
  constraint body_length check (char_length(trim(body)) between 1 and 2000)
);
create index post_comments_post_idx on public.post_comments (post_id, created_at);
create index post_comments_group_idx on public.post_comments (group_id);
create index post_comments_author_idx on public.post_comments (author_id);

-- Una reacción por persona y publicación (se puede cambiar de emoji)
create table public.post_reactions (
  post_id    uuid not null references public.posts (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  emoji      text not null check (emoji in ('👏', '❤️', '😂', '🥁', '🔥')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_reactions_user_idx on public.post_reactions (user_id);
create index post_reactions_group_idx on public.post_reactions (group_id);

create trigger posts_updated_at before update on public.posts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Triggers: autoría, grupo y fechas no se pueden falsear
-- ---------------------------------------------------------------------------
create or replace function public.posts_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.author_id := auth.uid();
    end if;
    new.created_at := now();
    new.edited_at := null;
  else
    new.id := old.id;
    new.group_id := old.group_id;
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    if new.body is distinct from old.body or new.video_url is distinct from old.video_url then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;
  new.body := trim(new.body);
  new.video_url := nullif(trim(new.video_url), '');
  return new;
end;
$$;

create trigger posts_before_write
  before insert or update on public.posts
  for each row execute function public.posts_before_write();

-- Fotos, comentarios y reacciones heredan el grupo de su publicación (para la
-- RLS y para filtrar el tiempo real por grupo) y no se pueden mover.
create or replace function public.wall_child_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.post_id := old.post_id;
  end if;
  select group_id into new.group_id from public.posts where id = new.post_id;
  if new.group_id is null then
    raise exception 'Publicación no encontrada';
  end if;
  if tg_table_name = 'post_comments' then
    if tg_op = 'INSERT' then
      if auth.uid() is not null then
        new.author_id := auth.uid();
      end if;
      new.created_at := now();
    else
      new.author_id := old.author_id;
      new.created_at := old.created_at;
    end if;
    new.body := trim(new.body);
  end if;
  return new;
end;
$$;

create trigger post_photos_before_write before insert or update on public.post_photos
  for each row execute function public.wall_child_before_write();
create trigger post_comments_before_write before insert or update on public.post_comments
  for each row execute function public.wall_child_before_write();
create trigger post_reactions_before_write before insert or update on public.post_reactions
  for each row execute function public.wall_child_before_write();

revoke execute on function public.posts_before_write()      from anon, authenticated, public;
revoke execute on function public.wall_child_before_write() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- is_group_member / can_manage_group (0001) ya comprueban que la cuenta está activa
-- ---------------------------------------------------------------------------
alter table public.posts          enable row level security;
alter table public.post_photos    enable row level security;
alter table public.post_comments  enable row level security;
alter table public.post_reactions enable row level security;

create policy "posts: ver"
  on public.posts for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "posts: publicar"
  on public.posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (public.is_group_member(group_id) or public.is_admin())
  );

create policy "posts: editar (autor/a)"
  on public.posts for update to authenticated
  using (author_id = (select auth.uid()) and (public.is_group_member(group_id) or public.is_admin()))
  with check (author_id = (select auth.uid()));

create policy "posts: borrar (autor/a o moderación)"
  on public.posts for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_active())
    or public.can_manage_group(group_id)
  );

-- Fotos: las añade quien escribió la publicación; se borran con ella (cascade)
create policy "post_photos: ver"
  on public.post_photos for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "post_photos: añadir"
  on public.post_photos for insert to authenticated
  with check (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    and split_part(path, '/', 1) = group_id::text
    and split_part(path, '/', 2) = post_id::text
  );

create policy "post_photos: borrar"
  on public.post_photos for delete to authenticated
  using (
    exists (select 1 from public.posts p where p.id = post_id and p.author_id = (select auth.uid()))
    or public.can_manage_group(group_id)
  );

create policy "post_comments: ver"
  on public.post_comments for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

-- El exists pasa por la RLS de posts: solo se comenta lo que se puede ver
create policy "post_comments: comentar"
  on public.post_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "post_comments: borrar (autor/a o moderación)"
  on public.post_comments for delete to authenticated
  using (
    (author_id = (select auth.uid()) and public.is_active())
    or public.can_manage_group(group_id)
  );

create policy "post_reactions: ver"
  on public.post_reactions for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "post_reactions: reaccionar"
  on public.post_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

create policy "post_reactions: cambiar"
  on public.post_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "post_reactions: quitar"
  on public.post_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: fotos del muro (privado)
-- Ruta: wall/<group_id>/<post_id>/<archivo>.jpg
-- ---------------------------------------------------------------------------
-- Grupo de una ruta del bucket (null si la ruta no empieza por un uuid)
create or replace function public.wall_path_group(p_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F-]{36}$' then split_part(p_name, '/', 1)::uuid end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall', 'wall', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "wall: ver (miembros del grupo)"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'wall'
    and (public.is_group_member(public.wall_path_group(name)) or public.is_admin())
  );

create policy "wall: subir (miembros del grupo)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wall'
    and array_length(storage.foldername(name), 1) = 2
    and (public.is_group_member(public.wall_path_group(name)) or public.is_admin())
  );

create policy "wall: borrar (quien subió o moderación)"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'wall'
    and (
      owner_id = (select auth.uid())::text
      or public.can_manage_group(public.wall_path_group(name))
    )
  );

-- ---------------------------------------------------------------------------
-- Tiempo real: la app escucha los cambios de su grupo (Realtime aplica la RLS)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.posts, public.post_photos, public.post_comments, public.post_reactions;
