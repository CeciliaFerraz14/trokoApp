-- =============================================================================
-- Troko Bloco · Migración 0020 · Notificación de pedidos de merch
-- Cada pedido nuevo de la Trokoteca avisa a los admins activos (no a quien lo
-- hace, aunque sea admin). Al tocarla se abre Trokoteca → Pedidos.
-- =============================================================================

create or replace function public.push_on_merch_order()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.send_push('merch_order', new.id);
  return new;
end;
$$;

create trigger merch_orders_push
  after insert on public.merch_orders
  for each row execute function public.push_on_merch_order();

revoke execute on function public.push_on_merch_order() from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- push_prepare: igual que en 0017, más el tipo 'merch_order'
-- ---------------------------------------------------------------------------
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
  v_ann record;
  v_msg record;
  v_order record;
  v_tag text;
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

  elsif p_kind = 'announcement' then
    select a.id, a.title, a.body, a.group_ids, a.author_id, a.important, a.link_url, a.birthday_of,
           coalesce(nullif(trim(p.nickname), ''), p.full_name, 'Troko Bloco') as author
      into v_ann
      from public.announcements a
      left join public.profiles p on p.id = a.author_id
     where a.id = p_id1;
    if not found then
      return null;
    end if;
    select count(*) into v_photos from public.announcement_photos where announcement_id = v_ann.id;
    v_title := case
      when v_ann.birthday_of is not null then v_ann.title
      when v_ann.important then 'Importante: ' || v_ann.title
      else 'Aviso: ' || v_ann.title
    end;
    v_body := case
      when v_ann.birthday_of is not null then v_ann.body
      when v_ann.body <> '' then left(v_ann.body, 140)
      when v_photos > 0 then v_ann.author || ' ha compartido ' || case when v_photos = 1 then 'una foto' else v_photos || ' fotos' end
      when v_ann.link_url is not null then v_ann.author || ' ha compartido un enlace'
      else 'Nuevo aviso de ' || v_ann.author
    end;
    v_url := '/avisos/' || v_ann.id;
    -- Generales: todas las cuentas activas; de grupo: sus miembros
    select array_agg(pr.id) into v_users
      from public.profiles pr
     where pr.status = 'active' and pr.id is distinct from v_ann.author_id
       -- A quien cumple años no se le avisa de su propio cumpleaños
       and pr.id is distinct from v_ann.birthday_of
       and (cardinality(v_ann.group_ids) = 0 or exists (
         select 1 from public.group_members m where m.user_id = pr.id and m.group_id = any (v_ann.group_ids)));

  elsif p_kind = 'chat' then
    select m.id, m.group_id, m.author_id, m.body, g.name as group_name,
           coalesce(nullif(trim(a.nickname), ''), a.full_name, 'Alguien') as author
      into v_msg
      from public.chat_messages m
      join public.groups g on g.id = m.group_id
      left join public.profiles a on a.id = m.author_id
     where m.id = p_id1;
    if not found then
      return null;
    end if;
    select count(*) into v_photos from public.chat_photos where message_id = v_msg.id;
    v_title := v_msg.group_name || ' · chat';
    -- Un mensaje sin texto siempre lleva fotos (aunque aún no se hayan guardado)
    v_body := v_msg.author || case
      when v_msg.body <> '' then ': ' || left(v_msg.body, 140)
      when v_photos > 1 then ' ha enviado ' || v_photos || ' fotos'
      else ' ha enviado una foto'
    end;
    v_url := '/muro/' || v_msg.group_id || '?tab=chat';
    -- Una notificación por chat: cada mensaje nuevo sustituye a la anterior
    v_tag := 'chat-' || v_msg.group_id;
    select array_agg(m.user_id) into v_users
      from public.group_members m
      join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
     where m.group_id = v_msg.group_id and m.user_id is distinct from v_msg.author_id;

  elsif p_kind = 'merch_order' then
    select o.id, o.user_id, o.product_name, o.size, o.quantity,
           coalesce(nullif(trim(p.nickname), ''), p.full_name, 'Alguien') as person
      into v_order
      from public.merch_orders o
      left join public.profiles p on p.id = o.user_id
     where o.id = p_id1;
    if not found then
      return null;
    end if;
    v_title := 'Nuevo pedido de merch';
    v_body := v_order.person || ': ' || v_order.quantity || ' × ' || v_order.product_name || coalesce(' · ' || v_order.size, '');
    v_url := '/trokoteca/pedidos';
    -- Solo a los admins, y nunca a quien ha hecho el pedido
    select array_agg(pr.id) into v_users
      from public.profiles pr
     where pr.status = 'active' and pr.role = 'admin' and pr.id is distinct from v_order.user_id;

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
    'tag', coalesce(v_tag, p_kind || '-' || p_id1 || coalesce('-' || p_id2, '')),
    'renotify', v_tag is not null,
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
