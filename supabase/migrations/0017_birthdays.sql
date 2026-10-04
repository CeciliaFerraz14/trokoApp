-- =============================================================================
-- Troko Bloco · Migración 0017 · Cumpleaños
-- Al registrarse se pide la fecha de nacimiento y si se quiere compartir el
-- cumpleaños con los grupos. Si se comparte, ese día (hora de Madrid) se
-- publica sola una felicitación en Avisos para sus grupos, que envía la
-- notificación push a sus miembros (no a quien cumple años).
--
-- - La fecha va en una tabla aparte que solo ve su dueño/a (los perfiles los
--   ven todas las cuentas activas): nadie más ve la fecha ni la edad.
-- - Los cumpleaños NO salen en el calendario.
-- - pg_cron llama cada mañana a birthday_announcements(); el aviso no se
--   duplica aunque se llame varias veces el mismo día.
-- =============================================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Fecha de nacimiento (privada)
-- ---------------------------------------------------------------------------
create table public.birthdays (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  birth_date date not null,
  -- Compartir el cumpleaños con sus grupos (felicitación y aviso)
  share      boolean not null default false,
  updated_at timestamptz not null default now()
);
create index birthdays_share_idx on public.birthdays (share) where share;

create or replace function public.birthdays_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  if new.birth_date < date '1900-01-01' or new.birth_date > current_date then
    raise exception 'Fecha de nacimiento no válida';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger birthdays_before_write
  before insert or update on public.birthdays
  for each row execute function public.birthdays_before_write();

revoke execute on function public.birthdays_before_write() from anon, authenticated, public;

alter table public.birthdays enable row level security;

create policy "birthdays: ver la mía"
  on public.birthdays for select to authenticated
  using (user_id = (select auth.uid()));

create policy "birthdays: guardar la mía"
  on public.birthdays for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "birthdays: cambiar la mía"
  on public.birthdays for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "birthdays: borrar la mía"
  on public.birthdays for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Registro: el perfil y, si viene, la fecha de nacimiento
-- (una fecha que no sea válida no impide crear la cuenta)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_birth date;
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
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Avisos de cumpleaños
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column birthday_of uuid references public.profiles (id) on delete cascade,
  add column birthday_on date;
create unique index announcements_birthday_idx on public.announcements (birthday_of, birthday_on) where birthday_of is not null;

-- Solo la base de datos crea avisos de cumpleaños; desde la app no se pueden
-- marcar ni cambiar
create or replace function public.announcements_birthday_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.birthday_of := null;
      new.birthday_on := null;
    else
      new.birthday_of := old.birthday_of;
      new.birthday_on := old.birthday_on;
    end if;
  end if;
  return new;
end;
$$;

create trigger announcements_birthday_guard
  before insert or update on public.announcements
  for each row execute function public.announcements_birthday_guard();

revoke execute on function public.announcements_birthday_guard() from anon, authenticated, public;

-- Publica las felicitaciones del día (por defecto, hoy en Madrid). Quien nació
-- un 29 de febrero lo celebra el 28 en los años no bisiestos. Devuelve cuántas
-- ha publicado.
create or replace function public.birthday_announcements(p_day date default (now() at time zone 'Europe/Madrid')::date)
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count int := 0;
  r record;
begin
  for r in
    select b.user_id,
           left(coalesce(nullif(trim(p.nickname), ''), p.full_name), 80) as name,
           array_agg(m.group_id) as groups
      from public.birthdays b
      join public.profiles p on p.id = b.user_id and p.status = 'active'
      join public.group_members m on m.user_id = b.user_id
      join public.groups g on g.id = m.group_id and g.archived_at is null
     where b.share
       and (
         to_char(b.birth_date, 'MM-DD') = to_char(p_day, 'MM-DD')
         or (to_char(b.birth_date, 'MM-DD') = '02-29' and to_char(p_day, 'MM-DD') = '02-28' and to_char(p_day + 1, 'MM-DD') = '03-01')
       )
     group by b.user_id, p.nickname, p.full_name
  loop
    insert into public.announcements (title, body, group_ids, birthday_of, birthday_on)
    values (
      '🎂 ¡Hoy es el cumpleaños de ' || r.name || '!',
      '¡Muchas felicidades de parte de toda la batucada! 🥁🎉',
      r.groups, r.user_id, p_day
    )
    on conflict (birthday_of, birthday_on) where birthday_of is not null do nothing;
    if found then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.birthday_announcements(date) from anon, authenticated, public;

-- Cada mañana a las 7:00 UTC (9:00 en verano y 8:00 en invierno en Madrid)
select cron.schedule('troko-cumpleanos', '0 7 * * *', 'select public.birthday_announcements()');

-- ---------------------------------------------------------------------------
-- Notificación: la felicitación va sin "Aviso:" y no se envía a quien cumple
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
