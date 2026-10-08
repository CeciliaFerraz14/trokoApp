-- =============================================================================
-- Troko Bloco · Migración 0029 · Reacciones en el chat
-- Una reacción por persona y mensaje (se puede cambiar de emoji o quitar),
-- con los mismos emojis que el muro.
-- =============================================================================

create table public.chat_reactions (
  message_id uuid not null references public.chat_messages (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  group_id   uuid not null references public.groups (id) on delete cascade,
  emoji      text not null check (emoji in ('👏', '❤️', '😂', '🥁', '🔥')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index chat_reactions_user_idx on public.chat_reactions (user_id);
create index chat_reactions_group_idx on public.chat_reactions (group_id);

-- Quién reacciona y en qué grupo lo pone la base de datos
create or replace function public.chat_reactions_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  select group_id into new.group_id from public.chat_messages where id = new.message_id;
  if new.group_id is null then
    raise exception 'Mensaje no encontrado';
  end if;
  new.created_at := now();
  return new;
end;
$$;

create trigger chat_reactions_before_write
  before insert or update on public.chat_reactions
  for each row execute function public.chat_reactions_before_write();

revoke execute on function public.chat_reactions_before_write() from anon, authenticated, public;

alter table public.chat_reactions enable row level security;

create policy "chat_reactions: ver"
  on public.chat_reactions for select to authenticated
  using (public.is_group_member(group_id) or public.is_admin());

create policy "chat_reactions: reaccionar"
  on public.chat_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.is_active()
    and (public.is_group_member(group_id) or public.is_admin())
  );

create policy "chat_reactions: cambiar la mía"
  on public.chat_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and (public.is_group_member(group_id) or public.is_admin()));

create policy "chat_reactions: quitar la mía"
  on public.chat_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.chat_reactions;
