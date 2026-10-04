-- =============================================================================
-- Troko Bloco · Migración 0019 · Trokoteca
-- Nueva sección con cuatro pestañas:
--   - Guías de información: título y texto, con un PDF opcional
--   - Música y Vídeos: enlaces (YouTube, Spotify…), no se suben archivos
--   - Merchandising: catálogo de productos y pedidos
--
-- - Todo lo publican y editan solo los admins; lo ven todas las cuentas activas.
-- - Pedidos: cada cual hace y ve los suyos y puede cancelarlos mientras estén
--   pendientes; los admins los ven todos y cambian su estado. No hay pagos.
-- - Archivos (PDF de las guías y fotos de productos) en el bucket privado
--   'trokoteca': guides/<item_id>/<archivo>.pdf y merch/<product_id>/<id>.jpg
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Guías, música y vídeos
-- ---------------------------------------------------------------------------
create type public.library_section as enum ('guide', 'music', 'video');

create table public.library_items (
  id         uuid primary key default gen_random_uuid(),
  section    public.library_section not null,
  title      text not null check (char_length(trim(title)) between 1 and 120),
  body       text not null default '' check (char_length(body) <= 20000),
  link_url   text check (link_url is null or link_url ~ '^https://'),
  -- Solo guías: PDF adjunto
  file_path  text,
  file_name  text check (file_name is null or char_length(file_name) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- La música y los vídeos son un enlace; el PDF solo va en las guías
  constraint library_items_link check (section = 'guide' or link_url is not null),
  constraint library_items_file check (section = 'guide' or file_path is null)
);
create index library_items_section_idx on public.library_items (section, created_at desc);

create or replace function public.library_items_before_write()
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
  end if;
  new.title := trim(new.title);
  if new.file_path is not null and split_part(new.file_path, '/', 1) <> 'guides'
     or new.file_path is not null and split_part(new.file_path, '/', 2) <> new.id::text then
    raise exception 'Ruta de archivo no válida';
  end if;
  if new.file_path is null then
    new.file_name := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger library_items_before_write
  before insert or update on public.library_items
  for each row execute function public.library_items_before_write();

revoke execute on function public.library_items_before_write() from anon, authenticated, public;

alter table public.library_items enable row level security;

create policy "library_items: ver (cuentas activas)"
  on public.library_items for select to authenticated
  using ((select public.is_active()));

create policy "library_items: crear (admins)"
  on public.library_items for insert to authenticated
  with check ((select public.is_admin()));

create policy "library_items: editar (admins)"
  on public.library_items for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "library_items: borrar (admins)"
  on public.library_items for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Merchandising: productos
-- ---------------------------------------------------------------------------
create table public.merch_products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '' check (char_length(description) <= 2000),
  -- En céntimos de euro
  price_cents int not null check (price_cents between 0 and 100000),
  -- Tallas o modelos a elegir; vacío = talla única
  sizes       text[] not null default '{}' check (cardinality(sizes) <= 15),
  -- Foto: merch/<id>/<foto>.jpg (miniatura al lado, <foto>_t.jpg)
  photo_path  text,
  -- Se puede pedir (si no, se ve como agotado)
  available   boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create or replace function public.merch_products_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  new.name := trim(new.name);
  -- Tallas sin espacios sobrantes, sin vacías ni repetidas, en el orden dado
  new.sizes := coalesce(array(
    select s from (
      select distinct on (trim(s)) trim(s) as s, ord
        from unnest(new.sizes) with ordinality as t(s, ord)
       where trim(s) <> ''
       order by trim(s), ord
    ) x order by ord
  ), '{}');
  if exists (select 1 from unnest(new.sizes) s where char_length(s) > 20) then
    raise exception 'Talla demasiado larga';
  end if;
  if new.photo_path is not null and (split_part(new.photo_path, '/', 1) <> 'merch' or split_part(new.photo_path, '/', 2) <> new.id::text) then
    raise exception 'Ruta de foto no válida';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger merch_products_before_write
  before insert or update on public.merch_products
  for each row execute function public.merch_products_before_write();

revoke execute on function public.merch_products_before_write() from anon, authenticated, public;

alter table public.merch_products enable row level security;

create policy "merch_products: ver (cuentas activas)"
  on public.merch_products for select to authenticated
  using ((select public.is_active()));

create policy "merch_products: crear (admins)"
  on public.merch_products for insert to authenticated
  with check ((select public.is_admin()));

create policy "merch_products: editar (admins)"
  on public.merch_products for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "merch_products: borrar (admins)"
  on public.merch_products for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Merchandising: pedidos
-- ---------------------------------------------------------------------------
create type public.merch_order_status as enum ('pending', 'ready', 'delivered', 'cancelled');

create table public.merch_orders (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  -- Si se borra el producto, el pedido se queda con su nombre y precio
  product_id       uuid references public.merch_products (id) on delete set null,
  product_name     text not null,
  unit_price_cents int not null,
  size             text,
  quantity         int not null check (quantity between 1 and 20),
  note             text not null default '' check (char_length(note) <= 500),
  status           public.merch_order_status not null default 'pending',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index merch_orders_user_idx on public.merch_orders (user_id, created_at desc);
create index merch_orders_status_idx on public.merch_orders (status, created_at desc);
create index merch_orders_product_idx on public.merch_orders (product_id);

create or replace function public.merch_orders_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product record;
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
      new.status := 'pending';
    end if;
    select name, price_cents, sizes, available into v_product
      from public.merch_products where id = new.product_id;
    if not found then
      raise exception 'Este producto ya no existe';
    end if;
    if not v_product.available then
      raise exception 'Este producto está agotado';
    end if;
    -- Nombre y precio se copian del producto: no se pueden elegir
    new.product_name := v_product.name;
    new.unit_price_cents := v_product.price_cents;
    new.size := nullif(trim(new.size), '');
    if cardinality(v_product.sizes) > 0 and (new.size is null or not new.size = any (v_product.sizes)) then
      raise exception 'Elige una talla';
    end if;
    if cardinality(v_product.sizes) = 0 then
      new.size := null;
    end if;
    new.created_at := now();
  else
    -- Lo pedido no cambia: solo el estado
    new.id := old.id;
    new.user_id := old.user_id;
    new.product_id := old.product_id;
    new.product_name := old.product_name;
    new.unit_price_cents := old.unit_price_cents;
    new.size := old.size;
    new.quantity := old.quantity;
    new.note := old.note;
    new.created_at := old.created_at;
    -- Sin ser admin, solo se puede cancelar un pedido propio pendiente
    if auth.uid() is not null and not public.is_admin() and new.status is distinct from old.status
       and not (old.status = 'pending' and new.status = 'cancelled') then
      raise exception 'Solo puedes cancelar un pedido pendiente';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger merch_orders_before_write
  before insert or update on public.merch_orders
  for each row execute function public.merch_orders_before_write();

revoke execute on function public.merch_orders_before_write() from anon, authenticated, public;

alter table public.merch_orders enable row level security;

create policy "merch_orders: ver los míos o, admins, todos"
  on public.merch_orders for select to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active())) or (select public.is_admin()));

create policy "merch_orders: pedir (cuentas activas)"
  on public.merch_orders for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active()));

create policy "merch_orders: cambiar estado (el mío o admins)"
  on public.merch_orders for update to authenticated
  using ((user_id = (select auth.uid()) and (select public.is_active())) or (select public.is_admin()))
  with check ((user_id = (select auth.uid()) and (select public.is_active())) or (select public.is_admin()));

create policy "merch_orders: borrar (admins)"
  on public.merch_orders for delete to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- Storage: PDF de las guías y fotos de productos (privado)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trokoteca', 'trokoteca', false, 10485760, array['application/pdf', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy "trokoteca: ver (cuentas activas)"
  on storage.objects for select to authenticated
  using (bucket_id = 'trokoteca' and public.is_active());

create policy "trokoteca: subir (admins)"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'trokoteca'
    and (storage.foldername(name))[1] in ('guides', 'merch')
    and array_length(storage.foldername(name), 1) = 2
    and public.is_admin()
  );

create policy "trokoteca: borrar (admins)"
  on storage.objects for delete to authenticated
  using (bucket_id = 'trokoteca' and public.is_admin());
