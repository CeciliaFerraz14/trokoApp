-- =============================================================================
-- Troko Bloco · Migración 0005 · Calendario y eventos
-- Eventos por categorías, para toda la batucada o para grupos concretos, con
-- repeticiones, asistencia, notas personales y suscripción .ics.
--
-- - Las repeticiones se guardan como eventos sueltos que comparten series_id:
--   así cada fecha tiene su propia asistencia y se puede cancelar o cambiar
--   una sola sin tocar las demás.
-- - Crear/editar/cancelar/borrar: admin, o coordinación de TODOS los grupos
--   del evento (igual que publicar avisos). Los generales, solo admin.
-- =============================================================================

-- Los permisos "según grupos" de la 0003 sirven igual para eventos: nombre
-- genérico. Las políticas de avisos siguen funcionando (se enlazan por OID).
alter function public.can_see_announcement(uuid[])     rename to can_see_for_groups;
alter function public.can_publish_announcement(uuid[]) rename to can_publish_for_groups;

-- ---------------------------------------------------------------------------
-- Tipos y tablas
-- ---------------------------------------------------------------------------
create type public.event_category as enum ('class', 'rehearsal', 'gig', 'festival', 'meeting', 'social', 'other');
create type public.attendance_status as enum ('yes', 'maybe', 'no');

create table public.events (
  id          uuid primary key default gen_random_uuid(),
  created_by  uuid references public.profiles (id) on delete set null,
  title       text not null,
  description text not null default '',
  category    public.event_category not null default 'other',
  location    text,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  all_day     boolean not null default false,
  group_ids   uuid[] not null default '{}',
  series_id   uuid,
  cancelled   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint title_length check (char_length(trim(title)) between 1 and 120),
  constraint description_length check (char_length(description) <= 5000),
  constraint location_length check (char_length(location) <= 200),
  constraint ends_after_start check (ends_at is null or ends_at >= starts_at)
);
create index events_starts_idx on public.events (starts_at);
create index events_series_idx on public.events (series_id, starts_at) where series_id is not null;
create index events_groups_idx on public.events using gin (group_ids);
create index events_created_by_idx on public.events (created_by);

create table public.event_attendance (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  status     public.attendance_status not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index event_attendance_user_idx on public.event_attendance (user_id);

-- Notas privadas de cada persona sobre un evento ("llevar el surdo")
create table public.event_notes (
  event_id   uuid not null references public.events (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  note       text not null,
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id),
  constraint note_length check (char_length(note) <= 2000)
);
create index event_notes_user_idx on public.event_notes (user_id);

-- Token secreto de la suscripción .ics (el calendario del móvil no tiene sesión)
create table public.calendar_tokens (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  token      text not null unique,
  created_at timestamptz not null default now()
);

create trigger events_updated_at before update on public.events
  for each row execute function public.set_updated_at();
create trigger event_attendance_updated_at before update on public.event_attendance
  for each row execute function public.set_updated_at();
create trigger event_notes_updated_at before update on public.event_notes
  for each row execute function public.set_updated_at();

-- Autoría, fechas y serie no se pueden falsear; los grupos se normalizan y validan
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
    new.created_by := old.created_by;
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

create trigger events_before_write
  before insert or update on public.events
  for each row execute function public.events_before_write();

-- ---------------------------------------------------------------------------
-- Funciones RPC
-- ---------------------------------------------------------------------------

-- Editar "este y los siguientes" de una serie en una sola operación.
-- p_rows: [{id, title, description, category, location, starts_at, ends_at,
-- all_day, group_ids}, …] ya calculados por la app. SECURITY INVOKER: las
-- políticas RLS se aplican fila a fila como en un update normal.
create or replace function public.update_event_series(p_rows jsonb)
returns int
language plpgsql security invoker
set search_path = ''
as $$
declare
  n int;
begin
  update public.events e set
    title       = r.title,
    description = coalesce(r.description, ''),
    category    = r.category,
    location    = r.location,
    starts_at   = r.starts_at,
    ends_at     = r.ends_at,
    all_day     = coalesce(r.all_day, false),
    group_ids   = coalesce(r.group_ids, '{}')
  from jsonb_to_recordset(p_rows) as r(
    id uuid, title text, description text, category public.event_category, location text,
    starts_at timestamptz, ends_at timestamptz, all_day boolean, group_ids uuid[]
  )
  where e.id = r.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Token .ics de la persona (se crea la primera vez)
create or replace function public.my_calendar_token()
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_active() then
    raise exception 'Necesitas una cuenta activa';
  end if;
  select token into v_token from public.calendar_tokens where user_id = auth.uid();
  if v_token is null then
    insert into public.calendar_tokens (user_id, token)
    values (auth.uid(), replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
    returning token into v_token;
  end if;
  return v_token;
end;
$$;

-- Nuevo token: el enlace anterior deja de funcionar
create or replace function public.regenerate_calendar_token()
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_active() then
    raise exception 'Necesitas una cuenta activa';
  end if;
  insert into public.calendar_tokens (user_id, token) values (auth.uid(), v_token)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return v_token;
end;
$$;

-- Eventos para el .ics (lo llama /api/ics sin sesión, con el token secreto).
-- Replica la visibilidad de "events: ver" para la persona dueña del token.
create or replace function public.calendar_feed(p_token text, p_event uuid default null)
returns table (
  id uuid, title text, description text, category public.event_category, location text,
  starts_at timestamptz, ends_at timestamptz, all_day boolean, cancelled boolean,
  updated_at timestamptz, group_names text[]
)
language sql stable security definer
set search_path = ''
as $$
  with me as (
    select p.id, p.role
    from public.calendar_tokens t
    join public.profiles p on p.id = t.user_id
    where t.token = p_token and p.status = 'active' and length(p_token) >= 32
  )
  select e.id, e.title, e.description, e.category, e.location, e.starts_at, e.ends_at,
         e.all_day, e.cancelled, e.updated_at,
         array(select g.name from public.groups g where g.id = any (e.group_ids) order by g.sort_order)
  from public.events e, me
  where (p_event is null or e.id = p_event)
    and e.starts_at >= now() - interval '90 days'
    and (
      cardinality(e.group_ids) = 0
      or me.role = 'admin'
      or exists (
        select 1 from public.group_members gm
        where gm.user_id = me.id and gm.group_id = any (e.group_ids)
      )
    )
  order by e.starts_at;
$$;

revoke execute on function public.events_before_write() from anon, authenticated, public;
revoke execute on function public.update_event_series(jsonb)   from anon, public;
revoke execute on function public.my_calendar_token()          from anon, public;
revoke execute on function public.regenerate_calendar_token()  from anon, public;
revoke execute on function public.calendar_feed(text, uuid)    from public;
grant execute on function public.update_event_series(jsonb)   to authenticated;
grant execute on function public.my_calendar_token()          to authenticated;
grant execute on function public.regenerate_calendar_token()  to authenticated;
-- anon a propósito: el calendario del móvil pide el .ics sin sesión
grant execute on function public.calendar_feed(text, uuid)    to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.events           enable row level security;
alter table public.event_attendance enable row level security;
alter table public.event_notes      enable row level security;
alter table public.calendar_tokens  enable row level security;
-- calendar_tokens: sin políticas; solo se usa a través de las funciones RPC

create policy "events: ver"
  on public.events for select to authenticated
  using (
    public.can_see_for_groups(group_ids)
    or (created_by = (select auth.uid()) and public.is_active())
  );

create policy "events: crear"
  on public.events for insert to authenticated
  with check (created_by = (select auth.uid()) and public.can_publish_for_groups(group_ids));

create policy "events: editar"
  on public.events for update to authenticated
  using (public.can_publish_for_groups(group_ids))
  with check (public.can_publish_for_groups(group_ids));

create policy "events: borrar"
  on public.events for delete to authenticated
  using (public.can_publish_for_groups(group_ids));

-- Asistencia: quien ve el evento ve quién va; cada cual responde por sí
-- (los exists pasan por la RLS de events)
create policy "event_attendance: ver"
  on public.event_attendance for select to authenticated
  using (exists (select 1 from public.events e where e.id = event_id));

create policy "event_attendance: responder"
  on public.event_attendance for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and not e.cancelled)
  );

create policy "event_attendance: cambiar"
  on public.event_attendance for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id and not e.cancelled)
  );

create policy "event_attendance: quitar"
  on public.event_attendance for delete to authenticated
  using (user_id = (select auth.uid()));

-- Notas: estrictamente privadas
create policy "event_notes: ver las mías"
  on public.event_notes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "event_notes: crear"
  on public.event_notes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id)
  );

create policy "event_notes: editar"
  on public.event_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "event_notes: borrar"
  on public.event_notes for delete to authenticated
  using (user_id = (select auth.uid()));
