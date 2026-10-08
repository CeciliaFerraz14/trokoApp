-- =============================================================================
-- Troko Bloco · Migración 0030 · Encuestas
-- Una encuesta va dentro de un aviso o de un mensaje del chat (uno de los dos).
-- - La ve y vota quien ve ese aviso o ese chat; se ve quién ha votado qué.
-- - La crea quien escribe el aviso (o un admin) o el mensaje.
-- - No se cambia una vez creada (para no liar los votos); su autor/a o un
--   admin puede cerrarla. Se borra con su aviso o su mensaje.
-- - Voto único o varias respuestas (multiple); se puede cambiar el voto.
-- =============================================================================

create table public.polls (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid unique references public.announcements (id) on delete cascade,
  message_id      uuid unique references public.chat_messages (id) on delete cascade,
  question        text not null,
  options         text[] not null,
  multiple        boolean not null default false,
  closed_at       timestamptz,
  created_by      uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  constraint one_parent check ((announcement_id is null) <> (message_id is null)),
  constraint question_length check (char_length(question) between 1 and 200),
  constraint options_count check (cardinality(options) between 2 and 10)
);
create index polls_created_by_idx on public.polls (created_by);

create table public.poll_votes (
  poll_id    uuid not null references public.polls (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  option     smallint not null,
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id, option)
);
create index poll_votes_user_idx on public.poll_votes (user_id);

-- Encuesta: autoría y fecha las pone la base de datos; textos sin espacios
-- sobrantes; al cambiarla solo se puede cerrar o reabrir
create or replace function public.polls_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if (new.announcement_id, new.message_id, new.question, new.options, new.multiple, new.created_by, new.created_at)
       is distinct from (old.announcement_id, old.message_id, old.question, old.options, old.multiple, old.created_by, old.created_at) then
      raise exception 'Una encuesta no se puede cambiar, solo cerrar';
    end if;
    return new;
  end if;
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  new.created_at := now();
  new.closed_at := null;
  new.question := trim(new.question);
  new.options := array(select trim(o) from unnest(new.options) o);
  if exists (select 1 from unnest(new.options) o where char_length(o) not between 1 and 80) then
    raise exception 'Cada respuesta debe tener entre 1 y 80 caracteres';
  end if;
  return new;
end;
$$;

create trigger polls_before_write
  before insert or update on public.polls
  for each row execute function public.polls_before_write();

-- Voto: siempre a nombre de quien vota, a una respuesta que exista, con la
-- encuesta abierta; en las de voto único sustituye al anterior
create or replace function public.poll_votes_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_poll record;
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  select options, multiple, closed_at into v_poll from public.polls where id = new.poll_id;
  if not found then
    raise exception 'Encuesta no encontrada';
  end if;
  if v_poll.closed_at is not null then
    raise exception 'La encuesta está cerrada';
  end if;
  if new.option < 0 or new.option >= cardinality(v_poll.options) then
    raise exception 'Esa respuesta no existe';
  end if;
  if not v_poll.multiple then
    delete from public.poll_votes where poll_id = new.poll_id and user_id = new.user_id and option <> new.option;
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger poll_votes_before_insert
  before insert on public.poll_votes
  for each row execute function public.poll_votes_before_insert();

-- Quitar el voto de una encuesta cerrada no se puede
create or replace function public.poll_votes_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and exists (select 1 from public.polls where id = old.poll_id and closed_at is not null) then
    raise exception 'La encuesta está cerrada';
  end if;
  return old;
end;
$$;

create trigger poll_votes_before_delete
  before delete on public.poll_votes
  for each row execute function public.poll_votes_before_delete();

revoke execute on function public.polls_before_write()       from anon, authenticated, public;
revoke execute on function public.poll_votes_before_insert() from anon, authenticated, public;
revoke execute on function public.poll_votes_before_delete() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Row Level Security (las subconsultas pasan por la RLS de avisos y chat:
-- solo cuentan los que esa persona puede ver)
-- ---------------------------------------------------------------------------
alter table public.polls      enable row level security;
alter table public.poll_votes enable row level security;

create policy "polls: ver"
  on public.polls for select to authenticated
  using (
    exists (select 1 from public.announcements a where a.id = announcement_id)
    or exists (select 1 from public.chat_messages m where m.id = message_id)
  );

create policy "polls: crear"
  on public.polls for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and public.is_active()
    and (
      exists (select 1 from public.announcements a
               where a.id = announcement_id and (a.author_id = (select auth.uid()) or public.is_admin()))
      or exists (select 1 from public.chat_messages m
               where m.id = message_id and m.author_id = (select auth.uid()))
    )
  );

create policy "polls: cerrar (autor/a o admin)"
  on public.polls for update to authenticated
  using ((created_by = (select auth.uid()) and public.is_active()) or public.is_admin());

create policy "polls: borrar (autor/a o admin)"
  on public.polls for delete to authenticated
  using ((created_by = (select auth.uid()) and public.is_active()) or public.is_admin());

create policy "poll_votes: ver"
  on public.poll_votes for select to authenticated
  using (exists (select 1 from public.polls p where p.id = poll_id));

create policy "poll_votes: votar"
  on public.poll_votes for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active()
    and exists (select 1 from public.polls p where p.id = poll_id)
  );

create policy "poll_votes: quitar el mío"
  on public.poll_votes for delete to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.polls, public.poll_votes;
