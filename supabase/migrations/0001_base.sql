-- =============================================================================
-- Troko Bloco · Migración 0001 · Base
-- Perfiles, grupos, pertenencia a grupos, roles, aprobación de cuentas,
-- códigos de invitación y bucket de avatares. Todo con Row Level Security.
--
-- Ejecutar en Supabase → SQL Editor (una sola vez, en orden).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('admin', 'member');
create type public.account_status as enum ('pending', 'active', 'rejected');
create type public.group_role as enum ('member', 'coordinator');

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Código de 6 caracteres sin caracteres ambiguos (0/O, 1/I/L)
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  nickname    text,
  avatar_url  text,
  instruments text[] not null default '{}',
  role        public.app_role not null default 'member',
  status      public.account_status not null default 'pending',
  approved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint full_name_length check (char_length(full_name) <= 80),
  constraint nickname_length check (char_length(nickname) <= 40)
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  color       text not null default '#6CB8E6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order  int  not null default 0,
  schedule    text,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.group_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

-- Los códigos van en una tabla aparte para que solo admins y coordinadores
-- puedan leerlos (RLS filtra filas, no columnas).
create table public.group_invite_codes (
  group_id   uuid primary key references public.groups (id) on delete cascade,
  code       text not null unique default public.generate_invite_code(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Funciones de permisos (security definer: leen saltándose RLS, sin recursión)
-- ---------------------------------------------------------------------------
create or replace function public.is_active()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active' and role = 'admin'
  );
$$;

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_coordinator(p_group uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = auth.uid() and role = 'coordinator'
  );
$$;

-- Admin, o coordinador/a de ese grupo
create or replace function public.can_manage_group(p_group uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or public.is_group_coordinator(p_group);
$$;

-- ---------------------------------------------------------------------------
-- Triggers de negocio
-- ---------------------------------------------------------------------------

-- Crea el perfil (pendiente) al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie salvo un admin puede cambiar rol/estado, y nadie el suyo propio.
-- Desde el SQL Editor (sin usuario) o desde funciones internas se permite.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;

  if new.role is distinct from old.role or new.status is distinct from old.status then
    if auth.uid() is not null
       and coalesce(current_setting('troko.bypass_profile_guard', true), '') <> 'on' then
      if not public.is_admin() then
        raise exception 'Solo un admin puede cambiar roles o estados';
      end if;
      if old.id = auth.uid() then
        raise exception 'No puedes cambiar tu propio rol o estado';
      end if;
    end if;
  end if;

  if new.status = 'active' and old.status <> 'active' then
    new.approved_at := now();
  elsif new.status <> 'active' then
    new.approved_at := null;
  else
    new.approved_at := old.approved_at;
  end if;

  return new;
end;
$$;

create trigger profiles_protect_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- Cada grupo nuevo recibe su código de invitación
create or replace function public.handle_new_group()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.group_invite_codes (group_id) values (new.id);
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- ---------------------------------------------------------------------------
-- Funciones RPC (llamables desde la app)
-- ---------------------------------------------------------------------------

-- Unirse a un grupo con su código. Si la cuenta estaba pendiente, se aprueba.
create or replace function public.join_with_code(p_code text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_status public.account_status;
begin
  if auth.uid() is null then
    raise exception 'Necesitas iniciar sesión';
  end if;

  select c.group_id into v_group
  from public.group_invite_codes c
  join public.groups g on g.id = c.group_id
  where c.code = upper(trim(p_code)) and g.archived_at is null;

  if v_group is null then
    raise exception 'Código no válido';
  end if;

  select status into v_status from public.profiles where id = auth.uid();
  if v_status = 'rejected' then
    raise exception 'Tu cuenta no está autorizada. Habla con la organización.';
  end if;

  insert into public.group_members (group_id, user_id)
  values (v_group, auth.uid())
  on conflict do nothing;

  if v_status = 'pending' then
    perform set_config('troko.bypass_profile_guard', 'on', true);
    update public.profiles set status = 'active' where id = auth.uid();
    perform set_config('troko.bypass_profile_guard', 'off', true);
  end if;

  return v_group;
end;
$$;

-- Aprobar una cuenta y asignarle grupos en un solo paso (solo admin)
create or replace function public.approve_user(p_user uuid, p_groups uuid[])
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede aprobar cuentas';
  end if;

  update public.profiles set status = 'active' where id = p_user;

  insert into public.group_members (group_id, user_id)
  select unnest(coalesce(p_groups, '{}')), p_user
  on conflict do nothing;
end;
$$;

-- Regenerar el código de invitación de un grupo (solo admin)
create or replace function public.regenerate_invite_code(p_group uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede regenerar códigos';
  end if;

  loop
    v_code := public.generate_invite_code();
    begin
      insert into public.group_invite_codes (group_id, code, updated_at)
      values (p_group, v_code, now())
      on conflict (group_id) do update set code = excluded.code, updated_at = now();
      return v_code;
    exception when unique_violation then
      -- colisión improbable con el código de otro grupo: probar otro
    end;
  end loop;
end;
$$;

-- Emails de las cuentas (solo admin). Los emails no se guardan en profiles
-- para que el resto de miembros no puedan leerlos.
create or replace function public.admin_user_emails()
returns table (id uuid, email text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver los emails';
  end if;
  return query select u.id, u.email::text from auth.users u;
end;
$$;

-- Las funciones auxiliares no deben ser invocables por usuarios anónimos
revoke execute on function public.join_with_code(text) from anon, public;
revoke execute on function public.approve_user(uuid, uuid[]) from anon, public;
revoke execute on function public.regenerate_invite_code(uuid) from anon, public;
revoke execute on function public.admin_user_emails() from anon, public;
grant execute on function public.join_with_code(text) to authenticated;
grant execute on function public.approve_user(uuid, uuid[]) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.admin_user_emails() to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.groups             enable row level security;
alter table public.group_members      enable row level security;
alter table public.group_invite_codes enable row level security;

-- profiles: cada cual ve el suyo; las cuentas activas ven a las demás activas;
-- los admins ven todas (incluidas pendientes).
create policy "profiles: ver"
  on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or public.is_admin()
    or (status = 'active' and public.is_active())
  );

create policy "profiles: editar propio o admin"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.is_admin())
  with check (id = (select auth.uid()) or public.is_admin());

-- groups: cualquier cuenta activa los ve; solo admin los gestiona
create policy "groups: ver"
  on public.groups for select to authenticated
  using (public.is_active());

create policy "groups: crear (admin)"
  on public.groups for insert to authenticated
  with check (public.is_admin());

create policy "groups: editar (admin)"
  on public.groups for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "groups: borrar (admin)"
  on public.groups for delete to authenticated
  using (public.is_admin());

-- group_members: las cuentas activas ven quién está en cada grupo;
-- la cuenta propia siempre ve sus grupos; solo admin asigna.
create policy "group_members: ver"
  on public.group_members for select to authenticated
  using (user_id = (select auth.uid()) or public.is_active());

create policy "group_members: crear (admin)"
  on public.group_members for insert to authenticated
  with check (public.is_admin());

create policy "group_members: editar (admin)"
  on public.group_members for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "group_members: borrar (admin)"
  on public.group_members for delete to authenticated
  using (public.is_admin());

-- group_invite_codes: solo admin y coordinación del grupo (cambios vía RPC)
create policy "invite_codes: ver"
  on public.group_invite_codes for select to authenticated
  using (public.can_manage_group(group_id));

-- ---------------------------------------------------------------------------
-- Storage: avatares (público para lectura; cada cual escribe en su carpeta)
-- Ruta: avatars/<user_id>/avatar.jpg
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: ver"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars: subir el propio"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: actualizar el propio"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars: borrar el propio"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
