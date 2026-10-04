-- =============================================================================
-- Troko Bloco · Migración 0021 · Mensajes del chat sin leer
-- Se guarda hasta cuándo ha leído cada persona el chat de cada grupo (en el
-- servidor: leer en un móvil también cuenta en los demás). La app muestra
-- cuántos mensajes de otras personas hay después de eso.
--
-- - Si nunca ha abierto el chat de un grupo, cuenta desde que entró en él.
-- - Solo cuenta en los grupos de los que es miembro y no están archivados.
-- =============================================================================

create table public.chat_reads (
  user_id uuid not null references public.profiles (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

alter table public.chat_reads enable row level security;

-- Se escribe solo con mark_chat_read()
create policy "chat_reads: ver los míos"
  on public.chat_reads for select to authenticated
  using (user_id = (select auth.uid()));

-- Marca el chat del grupo como leído hasta ahora (hora del servidor)
create or replace function public.mark_chat_read(p_group uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not (public.is_group_member(p_group) or public.is_admin()) then
    return;
  end if;
  insert into public.chat_reads (user_id, group_id, read_at)
  values (auth.uid(), p_group, now())
  on conflict (user_id, group_id) do update set read_at = greatest(public.chat_reads.read_at, excluded.read_at);
end;
$$;

-- Mensajes sin leer en cada uno de mis grupos (solo los que tienen alguno)
create or replace function public.my_chat_unread()
returns table (group_id uuid, unread int)
language sql stable security definer
set search_path = ''
as $$
  select m.group_id, count(*)::int
    from public.group_members m
    join public.groups g on g.id = m.group_id and g.archived_at is null
    left join public.chat_reads r on r.user_id = m.user_id and r.group_id = m.group_id
    join public.chat_messages c on c.group_id = m.group_id
     and c.author_id <> m.user_id
     and c.created_at > coalesce(r.read_at, m.created_at)
   where m.user_id = auth.uid() and public.is_active()
   group by m.group_id;
$$;

revoke execute on function public.mark_chat_read(uuid) from anon, public;
revoke execute on function public.my_chat_unread() from anon, public;
grant execute on function public.mark_chat_read(uuid) to authenticated;
grant execute on function public.my_chat_unread() to authenticated;
