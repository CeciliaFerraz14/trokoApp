-- =============================================================================
-- Troko Bloco · Migración 0009 · Solicitudes para entrar en grupos
-- Las cuentas activas ven todos los grupos (ya lo permitía "groups: ver") y
-- pueden pedir entrar en los que no están. Un admin acepta o rechaza.
-- - Aceptar: la persona pasa a ser miembro y la solicitud desaparece.
-- - Rechazar: queda como "rechazada" para que la persona lo vea; puede
--   borrarla o volver a pedirlo.
-- - Si entra por otro camino (código de invitación, un admin la añade), la
--   solicitud se borra sola.
-- =============================================================================

create type public.join_request_status as enum ('pending', 'rejected');

create table public.group_join_requests (
  group_id    uuid not null references public.groups (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  status      public.join_request_status not null default 'pending',
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (group_id, user_id)
);
create index group_join_requests_user_idx on public.group_join_requests (user_id);
create index group_join_requests_pending_idx on public.group_join_requests (created_at) where status = 'pending';

alter table public.group_join_requests enable row level security;

-- Cada cual ve las suyas; los admins, todas. Solo se crean y resuelven por
-- las funciones de abajo; borrar la propia = cancelarla o descartar un rechazo.
create policy "join_requests: ver"
  on public.group_join_requests for select to authenticated
  using (user_id = (select auth.uid()) or public.is_admin());

create policy "join_requests: borrar la propia"
  on public.group_join_requests for delete to authenticated
  using (user_id = (select auth.uid()));

-- Pedir entrar en un grupo (o volver a pedirlo tras un rechazo)
create or replace function public.request_group_access(p_group uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_active() then
    raise exception 'Necesitas una cuenta activa';
  end if;
  if not exists (select 1 from public.groups where id = p_group and archived_at is null) then
    raise exception 'Grupo no válido';
  end if;
  if exists (select 1 from public.group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'Ya estás en este grupo';
  end if;
  insert into public.group_join_requests (group_id, user_id)
  values (p_group, auth.uid())
  on conflict (group_id, user_id) do update
    set status = 'pending', created_at = now(), resolved_at = null;
end;
$$;

-- Aceptar o rechazar (solo admin)
create or replace function public.resolve_group_request(p_group uuid, p_user uuid, p_accept boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede aceptar o rechazar solicitudes';
  end if;
  if not exists (
    select 1 from public.group_join_requests
    where group_id = p_group and user_id = p_user and status = 'pending'
  ) then
    raise exception 'Esta solicitud ya no está pendiente';
  end if;

  if p_accept then
    -- El trigger de group_members borra la solicitud
    insert into public.group_members (group_id, user_id)
    values (p_group, p_user)
    on conflict do nothing;
  else
    update public.group_join_requests
    set status = 'rejected', resolved_at = now()
    where group_id = p_group and user_id = p_user;
  end if;
end;
$$;

-- Al entrar en un grupo por cualquier camino, su solicitud sobra
create or replace function public.clear_join_request()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.group_join_requests where group_id = new.group_id and user_id = new.user_id;
  return new;
end;
$$;

create trigger group_members_clear_request
  after insert on public.group_members
  for each row execute function public.clear_join_request();

revoke execute on function public.clear_join_request() from anon, authenticated, public;
revoke execute on function public.request_group_access(uuid) from anon, public;
revoke execute on function public.resolve_group_request(uuid, uuid, boolean) from anon, public;
grant execute on function public.request_group_access(uuid) to authenticated;
grant execute on function public.resolve_group_request(uuid, uuid, boolean) to authenticated;
