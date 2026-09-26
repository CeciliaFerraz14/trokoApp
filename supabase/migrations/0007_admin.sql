-- =============================================================================
-- Troko Bloco · Migración 0007 · Admin completo
-- - Resumen para admins: personas, contenido y uso del plan gratuito.
-- - Restablecer contraseñas desde la app (sin SQL Editor).
-- - Borrar cuentas: la propia (Perfil) o cualquiera (admin). Se borran el
--   perfil, sus publicaciones y comentarios del muro, su asistencia y sus
--   notas. Los avisos y eventos que creó se quedan (son de la organización).
--   Nunca se puede borrar a la última persona admin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Resumen (solo admin)
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
      'comments',      (select count(*) from public.post_comments)
    ),
    'storage', (
      select jsonb_build_object(
        'wall_bytes',    coalesce(sum((metadata ->> 'size')::bigint) filter (where bucket_id = 'wall'), 0),
        'avatars_bytes', coalesce(sum((metadata ->> 'size')::bigint) filter (where bucket_id = 'avatars'), 0)
      ) from storage.objects
    ),
    'database_bytes', pg_database_size(current_database())
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Restablecer contraseña (solo admin, a otra persona)
-- ---------------------------------------------------------------------------
create or replace function public.admin_reset_password(p_user uuid, p_password text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede restablecer contraseñas';
  end if;
  if p_user = auth.uid() then
    raise exception 'Tu propia contraseña se cambia en Perfil → Cambiar contraseña';
  end if;
  if char_length(coalesce(p_password, '')) < 8 then
    raise exception 'La contraseña es demasiado corta (mínimo 8 caracteres).';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user;
  if not found then
    raise exception 'Cuenta no encontrada';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Borrar cuentas
-- ---------------------------------------------------------------------------

-- Quién puede borrar la cuenta p_user: la propia persona o un admin
create or replace function public.can_delete_account(p_user uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select auth.uid() is not null and (p_user = auth.uid() or public.is_admin());
$$;

-- Archivos de Storage de la cuenta, para que la app los borre ANTES de borrar
-- la cuenta (los archivos solo se pueden borrar por la API de Storage).
create or replace function public.account_files(p_user uuid)
returns text[]
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.can_delete_account(p_user) then
    raise exception 'No puedes borrar esta cuenta';
  end if;
  return array(
    select f.path from public.post_photos f
    join public.posts p on p.id = f.post_id
    where p.author_id = p_user
    union all
    select regexp_replace(f.path, '\.jpg$', '_t.jpg') from public.post_photos f
    join public.posts p on p.id = f.post_id
    where p.author_id = p_user
  );
end;
$$;

create or replace function public.delete_account(p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_delete_account(p_user) then
    raise exception 'No puedes borrar esta cuenta';
  end if;
  if exists (select 1 from public.profiles where id = p_user and role = 'admin' and status = 'active')
     and (select count(*) from public.profiles where role = 'admin' and status = 'active') <= 1 then
    raise exception 'Es la única cuenta admin: nombra antes a otra persona admin';
  end if;

  -- Contenido personal del muro (las fotos, comentarios y reacciones de sus
  -- publicaciones se van en cascada)
  delete from public.posts where author_id = p_user;
  delete from public.post_comments where author_id = p_user;
  -- El resto (perfil, grupos, asistencia, notas, leídos, reacciones, token
  -- del calendario) cuelga de profiles/auth.users con on delete cascade
  delete from auth.users where id = p_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Autoría al borrar cuentas
-- Los triggers de 0003/0005/0006 impedían cambiar la autoría, y con eso
-- también bloqueaban el "on delete set null" de la FK: el aviso o evento se
-- quedaba apuntando a una cuenta borrada. Ahora solo se acepta pasar a null
-- cuando esa cuenta ya no existe (es decir, cuando lo hace la FK).
-- ---------------------------------------------------------------------------
create or replace function public.kept_author(p_old uuid, p_new uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  select case
    when p_new is null and p_old is not null and not exists (select 1 from public.profiles where id = p_old) then null
    else p_old
  end;
$$;

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
    if new.title is distinct from old.title or new.body is distinct from old.body then
      new.edited_at := now();
    else
      new.edited_at := old.edited_at;
    end if;
  end if;

  new.title := trim(new.title);
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

create or replace function public.events_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
    end if;
    new.created_at := now();
  else
    new.id := old.id;
    new.created_by := public.kept_author(old.created_by, new.created_by);
    new.created_at := old.created_at;
    new.series_id := old.series_id;
  end if;

  new.title := trim(new.title);
  new.location := nullif(trim(new.location), '');
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
    new.author_id := public.kept_author(old.author_id, new.author_id);
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
      new.author_id := public.kept_author(old.author_id, new.author_id);
      new.created_at := old.created_at;
    end if;
    new.body := trim(new.body);
  end if;
  return new;
end;
$$;

revoke execute on function public.kept_author(uuid, uuid) from anon, public;

revoke execute on function public.admin_stats()                       from anon, public;
revoke execute on function public.admin_reset_password(uuid, text)     from anon, public;
revoke execute on function public.can_delete_account(uuid)             from anon, public;
revoke execute on function public.account_files(uuid)                  from anon, public;
revoke execute on function public.delete_account(uuid)                 from anon, public;
grant execute on function public.admin_stats()                   to authenticated;
grant execute on function public.admin_reset_password(uuid, text) to authenticated;
grant execute on function public.can_delete_account(uuid)         to authenticated;
grant execute on function public.account_files(uuid)              to authenticated;
grant execute on function public.delete_account(uuid)             to authenticated;

-- Un admin puede borrar el avatar de otra persona (al borrar su cuenta)
create policy "avatars: borrar (admin)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and public.is_admin());
