-- =============================================================================
-- Troko Bloco · Migración 0003 · Avisos
-- Tablón de avisos para toda la batucada o para grupos concretos, con avisos
-- importantes, fijados y control de leídos.
--
-- - group_ids vacío = aviso general (lo ven todas las cuentas activas).
-- - Avisos generales: solo admin. Avisos de grupo: admin o coordinación de
--   TODOS los grupos del aviso.
-- - Editar, fijar y borrar: quien lo escribió o un admin.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.announcements (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid references public.profiles (id) on delete set null,
  title      text not null,
  body       text not null default '',
  group_ids  uuid[] not null default '{}',
  important  boolean not null default false,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Solo cambia al editar el texto (no al fijar/desfijar)
  edited_at  timestamptz,
  constraint title_length check (char_length(trim(title)) between 1 and 120),
  constraint body_length check (char_length(body) <= 5000)
);
create index announcements_created_idx on public.announcements (pinned desc, created_at desc);
create index announcements_groups_idx on public.announcements using gin (group_ids);

create table public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index announcement_reads_user_idx on public.announcement_reads (user_id);

create trigger announcements_updated_at before update on public.announcements
  for each row execute function public.set_updated_at();

-- Autoría y fechas no se pueden falsear; los grupos se normalizan y validan
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
    new.author_id := old.author_id;
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

create trigger announcements_before_write
  before insert or update on public.announcements
  for each row execute function public.announcements_before_write();

-- ---------------------------------------------------------------------------
-- Funciones de permisos
-- ---------------------------------------------------------------------------

-- Ver un aviso: generales para toda cuenta activa; de grupo, para sus miembros
create or replace function public.can_see_announcement(p_groups uuid[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active() and (
    cardinality(p_groups) = 0
    or public.is_admin()
    or exists (
      select 1 from public.group_members
      where user_id = auth.uid() and group_id = any (p_groups)
    )
  );
$$;

-- Publicar para esos grupos: admin siempre; coordinación solo en sus grupos
create or replace function public.can_publish_announcement(p_groups uuid[])
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    cardinality(p_groups) > 0
    and public.is_active()
    and not exists (
      select 1 from unnest(p_groups) g
      where not public.is_group_coordinator(g)
    )
  );
$$;

revoke execute on function public.announcements_before_write() from anon, authenticated, public;
revoke execute on function public.can_see_announcement(uuid[])     from anon, public;
revoke execute on function public.can_publish_announcement(uuid[]) from anon, public;
grant execute on function public.can_see_announcement(uuid[])     to authenticated;
grant execute on function public.can_publish_announcement(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.announcements      enable row level security;
alter table public.announcement_reads enable row level security;

create policy "announcements: ver"
  on public.announcements for select to authenticated
  using (
    public.can_see_announcement(group_ids)
    or (author_id = (select auth.uid()) and public.is_active())
  );

create policy "announcements: publicar"
  on public.announcements for insert to authenticated
  with check (author_id = (select auth.uid()) and public.can_publish_announcement(group_ids));

create policy "announcements: editar (autor/a o admin)"
  on public.announcements for update to authenticated
  using ((author_id = (select auth.uid()) and public.is_active()) or public.is_admin())
  with check (public.can_publish_announcement(group_ids));

create policy "announcements: borrar (autor/a o admin)"
  on public.announcements for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_active()) or public.is_admin());

-- Leídos: cada cual ve y marca los suyos; autor/a y admins ven quién lo ha leído
create policy "announcement_reads: ver"
  on public.announcement_reads for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or exists (
      select 1 from public.announcements a
      where a.id = announcement_id and a.author_id = (select auth.uid())
    )
  );

-- Solo se puede marcar un aviso que se puede ver (el exists pasa por su RLS)
create policy "announcement_reads: marcar"
  on public.announcement_reads for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.announcements a where a.id = announcement_id)
  );
