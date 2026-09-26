-- =============================================================================
-- Troko Bloco · Migración 0012 · Fotos y enlaces en los avisos (+ su aviso push)
-- Como en el muro: hasta 6 fotos (bucket privado "announcements") y un enlace
-- (vídeo, Spotify…). Las fotos las ve quien puede ver el aviso.
-- Ruta de las fotos: announcements/<announcement_id>/<foto>.jpg (y _t.jpg).
-- Además, cada aviso nuevo envía una notificación push a quien va dirigido.
-- =============================================================================

alter table public.announcements
  add column link_url text,
  add constraint link_url_format check (link_url ~ '^https://[^\s]+$' and char_length(link_url) <= 500);

-- El trigger de 0003/0007 también normaliza el enlace y marca "editado" si cambia
create or replace function public.announcements_before_write()
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
    new.author_id := public.kept_author(old.author_id, new.author_id);
    new.created_at := old.created_at;
    if new.title is distinct from old.title or new.body is distinct from old.body
       or new.link_url is distinct from old.link_url then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;

  new.title := trim(new.title);
  new.link_url := nullif(trim(new.link_url), '');
  new.group_ids := coalesce(
    (select array_agg(distinct g order by g) from unnest(new.group_ids) g where g is not null),
    '{}'
  );
  if exists (
    select 1 from unnest(new.group_ids) g
    where not exists (select 1 from public.groups where id = g)
  ) then
    raise exception 'Grupo no válido';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fotos de los avisos
-- ---------------------------------------------------------------------------
create table public.announcement_photos (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  path            text not null unique,
  width           int not null check (width > 0),
  height          int not null check (height > 0),
  position        int not null default 0,
  created_at      timestamptz not null default now()
);
create index announcement_photos_announcement_idx on public.announcement_photos (announcement_id, position);

alter table public.announcement_photos enable row level security;

-- Los exists pasan por la RLS de announcements: se ve lo que se puede ver
create policy "announcement_photos: ver"
  on public.announcement_photos for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));

-- Las añade quien puede editar el aviso (su autor/a o un admin), en su carpeta
create policy "announcement_photos: añadir"
  on public.announcement_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and ((a.author_id = (select auth.uid()) and public.is_active()) or public.is_admin())
    )
    and split_part(path, '/', 1) = announcement_id::text
  );

create policy "announcement_photos: borrar"
  on public.announcement_photos for delete to authenticated
  using (
    exists (
      select 1 from public.announcements a
      where a.id = announcement_id
        and ((a.author_id = (select auth.uid()) and public.is_active()) or public.is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: bucket privado "announcements"
-- (wall_path_group de 0006 devuelve el uuid de la primera carpeta de la ruta)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('announcements', 'announcements', false, 1048576, array['image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "announcements: ver fotos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'announcements'
    and exists (select 1 from public.announcements a where a.id = public.wall_path_group(name))
  );

create policy "announcements: subir fotos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'announcements'
    and array_length(storage.foldername(name), 1) = 1
    and exists (
      select 1 from public.announcements a
      where a.id = public.wall_path_group(name)
        and ((a.author_id = (select auth.uid()) and public.is_active()) or public.is_admin())
    )
  );

create policy "announcements: borrar fotos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'announcements'
    and (owner_id = (select auth.uid())::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- Notificación push de avisos nuevos
-- ---------------------------------------------------------------------------
create or replace function public.push_on_announcement()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.send_push('announcement', new.id);
  return new;
end;
$$;

create trigger announcements_push
  after insert on public.announcements
  for each row execute function public.push_on_announcement();

revoke execute on function public.push_on_announcement() from anon, authenticated, public;

create or replace function public.push_prepare(p_secret text, p_kind text, p_id1 uuid, p_id2 uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_url text;
  v_users uuid[];
  v_post record;
  v_ann record;
  v_photos int;
  v_groups text;
begin
  if p_secret is null or p_secret is distinct from (select value from private.app_config where key = 'push_secret') then
    raise exception 'No autorizado';
  end if;

  if p_kind = 'post' then
    select p.id, p.group_id, p.author_id, p.body, p.video_url, g.name as group_name,
           coalesce(nullif(trim(a.nickname), ''), a.full_name, 'Alguien') as author
      into v_post
      from public.posts p
      join public.groups g on g.id = p.group_id
      left join public.profiles a on a.id = p.author_id
     where p.id = p_id1;
    if not found then
      return null;
    end if;
    select count(*) into v_photos from public.post_photos where post_id = v_post.id;
    v_title := v_post.group_name;
    v_body := v_post.author || case
      when v_post.body <> '' then ': ' || left(v_post.body, 140)
      when v_photos > 1 then ' ha compartido ' || v_photos || ' fotos'
      when v_photos = 1 then ' ha compartido una foto'
      when v_post.video_url ~ 'spotify' then ' ha compartido música'
      when v_post.video_url is not null then ' ha compartido un vídeo'
      else ' ha publicado en el muro'
    end;
    v_url := '/muro/' || v_post.group_id || '/p/' || v_post.id;
    select array_agg(m.user_id) into v_users
      from public.group_members m
      join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
     where m.group_id = v_post.group_id and m.user_id is distinct from v_post.author_id;

  elsif p_kind = 'announcement' then
    select a.id, a.title, a.body, a.group_ids, a.author_id, a.important, a.link_url,
           coalesce(nullif(trim(p.nickname), ''), p.full_name, 'Troko Bloco') as author
      into v_ann
      from public.announcements a
      left join public.profiles p on p.id = a.author_id
     where a.id = p_id1;
    if not found then
      return null;
    end if;
    select count(*) into v_photos from public.announcement_photos where announcement_id = v_ann.id;
    v_title := case when v_ann.important then 'Importante: ' else 'Aviso: ' end || v_ann.title;
    v_body := case
      when v_ann.body <> '' then left(v_ann.body, 140)
      when v_photos > 0 then v_ann.author || ' ha compartido ' || case when v_photos = 1 then 'una foto' else v_photos || ' fotos' end
      when v_ann.link_url is not null then v_ann.author || ' ha compartido un enlace'
      else 'Nuevo aviso de ' || v_ann.author
    end;
    v_url := '/avisos/' || v_ann.id;
    -- Generales: todas las cuentas activas; de grupo: sus miembros
    select array_agg(pr.id) into v_users
      from public.profiles pr
     where pr.status = 'active' and pr.id is distinct from v_ann.author_id
       and (cardinality(v_ann.group_ids) = 0 or exists (
         select 1 from public.group_members m where m.user_id = pr.id and m.group_id = any (v_ann.group_ids)));

  elsif p_kind = 'group_joined' then
    select 'Ya estás en ' || name, 'Entra a ver su muro, sus fotos y quién está.', '/muro/' || id
      into v_title, v_body, v_url
      from public.groups where id = p_id1;
    v_users := array[p_id2];

  elsif p_kind = 'account_approved' then
    select string_agg(g.name, ', ' order by g.sort_order) into v_groups
      from public.group_members m join public.groups g on g.id = m.group_id
     where m.user_id = p_id1 and g.archived_at is null;
    v_title := '¡Bienvenid@ a Troko Bloco!';
    v_body := 'Tu cuenta ya está aprobada. ' ||
      case when v_groups is null then 'Pide entrar en tus grupos desde Muro.' else 'Estás en ' || v_groups || '.' end;
    v_url := '/';
    v_users := array[p_id1];

  else
    raise exception 'Tipo de aviso desconocido: %', p_kind;
  end if;

  return jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'url', v_url,
    'tag', p_kind || '-' || p_id1 || coalesce('-' || p_id2, ''),
    'vapid', jsonb_build_object(
      'public', (select value from private.app_config where key = 'vapid_public'),
      'private', (select value from private.app_config where key = 'vapid_private'),
      'subject', (select value from private.app_config where key = 'vapid_subject')
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_subscriptions s where s.user_id = any (v_users)
    ), '[]'::jsonb)
  );
end;
$$;
