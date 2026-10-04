-- =============================================================================
-- Troko Bloco · Migración 0018 · Usuario de Instagram
-- Al registrarse (o en Perfil → Privacidad) se puede poner el usuario de
-- Instagram y dar permiso para que Troko Bloco le etiquete en sus
-- publicaciones.
--
-- - Va en una tabla aparte, como el cumpleaños: los perfiles los ven todas las
--   cuentas activas y esto no.
-- - Su dueño/a lo ve siempre; los admins solo si ha dado su permiso.
-- =============================================================================

create table public.instagram (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  -- Sin @, en minúsculas
  username    text not null,
  -- Permiso para etiquetarle en las publicaciones de Troko Bloco
  tag_consent boolean not null default false,
  updated_at  timestamptz not null default now()
);

create or replace function public.instagram_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  new.username := lower(regexp_replace(trim(new.username), '^@+', ''));
  if new.username !~ '^[a-z0-9._]{1,30}$' then
    raise exception 'Usuario de Instagram no válido';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger instagram_before_write
  before insert or update on public.instagram
  for each row execute function public.instagram_before_write();

revoke execute on function public.instagram_before_write() from anon, authenticated, public;

alter table public.instagram enable row level security;

create policy "instagram: ver el mío o, con permiso, admins"
  on public.instagram for select to authenticated
  using (user_id = (select auth.uid()) or (tag_consent and (select public.is_admin())));

create policy "instagram: guardar el mío"
  on public.instagram for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "instagram: cambiar el mío"
  on public.instagram for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "instagram: borrar el mío"
  on public.instagram for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Registro: el perfil y, si vienen, la fecha de nacimiento y el Instagram
-- (un dato que no sea válido no impide crear la cuenta)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_birth date;
  v_instagram text;
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''));

  begin
    v_birth := (new.raw_user_meta_data ->> 'birth_date')::date;
    if v_birth is not null then
      insert into public.birthdays (user_id, birth_date, share)
      values (new.id, v_birth, coalesce((new.raw_user_meta_data ->> 'share_birthday')::boolean, false));
    end if;
  exception when others then
    raise warning 'Fecha de nacimiento ignorada (%): %', new.id, sqlerrm;
  end;

  begin
    v_instagram := nullif(trim(new.raw_user_meta_data ->> 'instagram'), '');
    if v_instagram is not null then
      insert into public.instagram (user_id, username, tag_consent)
      values (new.id, v_instagram, coalesce((new.raw_user_meta_data ->> 'instagram_consent')::boolean, false));
    end if;
  exception when others then
    raise warning 'Instagram ignorado (%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
