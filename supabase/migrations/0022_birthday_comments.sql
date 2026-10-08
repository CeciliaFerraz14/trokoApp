-- =============================================================================
-- Troko Bloco · Migración 0022 · Comentarios en las felicitaciones
-- En los avisos de cumpleaños (birthday_of, 0017) se puede comentar para
-- felicitar; en el resto de avisos, no.
--
-- - Comenta y lee los comentarios quien ve el aviso (sus grupos), también
--   quien cumple años.
-- - Sin editar. Borra su autor/a o un admin.
-- - Al borrar la cuenta se borran sus comentarios (cascada).
-- =============================================================================

create table public.announcement_comments (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  author_id       uuid not null references public.profiles (id) on delete cascade,
  body            text not null,
  created_at      timestamptz not null default now(),
  constraint body_length check (char_length(trim(body)) between 1 and 2000)
);
create index announcement_comments_announcement_idx on public.announcement_comments (announcement_id, created_at);
create index announcement_comments_author_idx on public.announcement_comments (author_id);

-- Autoría y fecha las pone la base de datos
create or replace function public.announcement_comments_before_insert()
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

create trigger announcement_comments_before_insert
  before insert on public.announcement_comments
  for each row execute function public.announcement_comments_before_insert();

revoke execute on function public.announcement_comments_before_insert() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Row Level Security (las subconsultas a announcements pasan por su RLS:
-- solo cuentan los avisos que esa persona puede ver)
-- ---------------------------------------------------------------------------
alter table public.announcement_comments enable row level security;

create policy "announcement_comments: ver"
  on public.announcement_comments for select to authenticated
  using (exists (select 1 from public.announcements a where a.id = announcement_id));

create policy "announcement_comments: comentar felicitaciones"
  on public.announcement_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and public.is_active()
    and exists (select 1 from public.announcements a where a.id = announcement_id and a.birthday_of is not null)
  );

create policy "announcement_comments: borrar (autor/a o admin)"
  on public.announcement_comments for delete to authenticated
  using ((author_id = (select auth.uid()) and public.is_active()) or public.is_admin());

-- Los comentarios nuevos aparecen solos en la pantalla del aviso
alter publication supabase_realtime add table public.announcement_comments;
