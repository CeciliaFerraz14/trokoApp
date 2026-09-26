-- =============================================================================
-- Troko Bloco · Migración 0011 · Notificaciones push
-- Avisos al móvil (Web Push) cuando:
--   · alguien publica en el muro de tu grupo (a las demás personas del grupo)
--   · te aceptan o te añaden a un grupo
--   · aprueban tu cuenta
--
-- Cómo funciona: un trigger llama (pg_net, asíncrono, tras el commit) a la
-- función de Vercel /api/push con {kind, id1, id2}. Esa función pide a
-- push_prepare() el mensaje, las suscripciones de destino y las claves VAPID
-- (con un secreto compartido) y envía los avisos con web-push.
--
-- La configuración (URL, secreto, claves VAPID) va en private.app_config, un
-- esquema que la API no expone; se rellena a mano (no está en este archivo):
--   insert into private.app_config values
--     ('push_url', 'https://<app>/api/push'), ('push_secret', '<64 hex>'),
--     ('vapid_public', '…'), ('vapid_private', '…'), ('vapid_subject', 'mailto:…');
-- Sin configuración, no se envía nada (y nada falla).
-- =============================================================================

create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_config (
  key   text primary key,
  value text not null
);
revoke all on private.app_config from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Suscripciones (una por dispositivo)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint endpoint_https check (endpoint ~ '^https://')
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Cada cual ve las suyas (para saber si este móvil está suscrito); se
-- guardan y borran con las funciones de abajo
create policy "push_subscriptions: ver las mías"
  on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-- Clave pública VAPID (la necesita el navegador para suscribirse)
create or replace function public.push_public_key()
returns text
language sql stable security definer
set search_path = ''
as $$
  select value from private.app_config where key = 'vapid_public';
$$;

-- Guardar la suscripción de este dispositivo. Vale también con la cuenta
-- pendiente (para avisar cuando la aprueben), no si está rechazada. Si el
-- dispositivo estaba a nombre de otra cuenta, pasa a esta.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and status <> 'rejected'
  ) then
    raise exception 'No puedes activar notificaciones';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Envío
-- ---------------------------------------------------------------------------

-- Pide a la función de Vercel que envíe un aviso. Nunca hace fallar la
-- operación que lo provoca (publicar, aceptar…).
create or replace function public.send_push(p_kind text, p_id1 uuid, p_id2 uuid default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text := (select value from private.app_config where key = 'push_url');
  v_secret text := (select value from private.app_config where key = 'push_secret');
begin
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', p_kind, 'id1', p_id1, 'id2', p_id2),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-troko-secret', v_secret)
  );
exception when others then
  raise warning 'send_push (%): %', p_kind, sqlerrm;
end;
$$;

-- Nueva publicación
create or replace function public.push_on_post()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.send_push('post', new.id);
  return new;
end;
$$;

create trigger posts_push
  after insert on public.posts
  for each row execute function public.push_on_post();

-- Entrar en un grupo (solicitud aceptada o añadida por un admin). Si la
-- cuenta se acaba de aprobar en esta misma operación, ya avisa la aprobación.
create or replace function public.push_on_member()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles where id = new.user_id and status = 'active' and approved_at is distinct from now()) then
    perform public.send_push('group_joined', new.group_id, new.user_id);
  end if;
  return new;
end;
$$;

create trigger group_members_push
  after insert on public.group_members
  for each row execute function public.push_on_member();

-- Cuenta aprobada
create or replace function public.push_on_approval()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'active' and old.status <> 'active' then
    perform public.send_push('account_approved', new.id);
  end if;
  return new;
end;
$$;

create trigger profiles_push
  after update of status on public.profiles
  for each row execute function public.push_on_approval();

-- Mensaje, destinatarios y claves para /api/push (solo con el secreto)
create or replace function public.push_prepare(p_secret text, p_kind text, p_id1 uuid, p_id2 uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_url text;
  v_users uuid[];
  v_post record;
  v_photos int;
  v_groups text;
begin
  if p_secret is null or p_secret is distinct from (select value from private.app_config where key = 'push_secret') then
    raise exception 'No autorizado';
  end if;

  if p_kind = 'post' then
    select p.id, p.group_id, p.author_id, p.body, p.video_url, g.name as group_name,
           coalesce(nullif(trim(a.nickname), ''), a.full_name, 'Alguien') as author
      into v_post
      from public.posts p
      join public.groups g on g.id = p.group_id
      left join public.profiles a on a.id = p.author_id
     where p.id = p_id1;
    if not found then
      return null;
    end if;
    select count(*) into v_photos from public.post_photos where post_id = v_post.id;
    v_title := v_post.group_name;
    v_body := v_post.author || case
      when v_post.body <> '' then ': ' || left(v_post.body, 140)
      when v_photos > 1 then ' ha compartido ' || v_photos || ' fotos'
      when v_photos = 1 then ' ha compartido una foto'
      when v_post.video_url ~ 'spotify' then ' ha compartido música'
      when v_post.video_url is not null then ' ha compartido un vídeo'
      else ' ha publicado en el muro'
    end;
    v_url := '/muro/' || v_post.group_id || '/p/' || v_post.id;
    select array_agg(m.user_id) into v_users
      from public.group_members m
      join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
     where m.group_id = v_post.group_id and m.user_id is distinct from v_post.author_id;

  elsif p_kind = 'group_joined' then
    select 'Ya estás en ' || name, 'Entra a ver su muro, sus fotos y quién está.', '/muro/' || id
      into v_title, v_body, v_url
      from public.groups where id = p_id1;
    v_users := array[p_id2];

  elsif p_kind = 'account_approved' then
    select string_agg(g.name, ', ' order by g.sort_order) into v_groups
      from public.group_members m join public.groups g on g.id = m.group_id
     where m.user_id = p_id1 and g.archived_at is null;
    v_title := '¡Bienvenid@ a Troko Bloco!';
    v_body := 'Tu cuenta ya está aprobada. ' ||
      case when v_groups is null then 'Pide entrar en tus grupos desde Muro.' else 'Estás en ' || v_groups || '.' end;
    v_url := '/';
    v_users := array[p_id1];

  else
    raise exception 'Tipo de aviso desconocido: %', p_kind;
  end if;

  return jsonb_build_object(
    'title', v_title,
    'body', v_body,
    'url', v_url,
    'tag', p_kind || '-' || p_id1 || coalesce('-' || p_id2, ''),
    'vapid', jsonb_build_object(
      'public', (select value from private.app_config where key = 'vapid_public'),
      'private', (select value from private.app_config where key = 'vapid_private'),
      'subject', (select value from private.app_config where key = 'vapid_subject')
    ),
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
        from public.push_subscriptions s where s.user_id = any (v_users)
    ), '[]'::jsonb)
  );
end;
$$;

-- Quitar suscripciones que el servicio de push da por caducadas (404/410)
create or replace function public.push_forget(p_secret text, p_endpoints text[])
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_secret is null or p_secret is distinct from (select value from private.app_config where key = 'push_secret') then
    raise exception 'No autorizado';
  end if;
  delete from public.push_subscriptions where endpoint = any (p_endpoints);
end;
$$;

revoke execute on function public.send_push(text, uuid, uuid) from anon, authenticated, public;
revoke execute on function public.push_on_post() from anon, authenticated, public;
revoke execute on function public.push_on_member() from anon, authenticated, public;
revoke execute on function public.push_on_approval() from anon, authenticated, public;
revoke execute on function public.push_public_key() from anon, public;
revoke execute on function public.save_push_subscription(text, text, text, text) from anon, public;
revoke execute on function public.delete_push_subscription(text) from anon, public;
grant execute on function public.push_public_key() to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;
-- anon a propósito: las llama /api/push con la clave pública; las protege el secreto
revoke execute on function public.push_prepare(text, text, uuid, uuid) from public;
revoke execute on function public.push_forget(text, text[]) from public;
grant execute on function public.push_prepare(text, text, uuid, uuid) to anon, authenticated;
grant execute on function public.push_forget(text, text[]) to anon, authenticated;
