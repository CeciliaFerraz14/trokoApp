-- =============================================================================
-- Troko Bloco · Migración 0023 · Imagen de cada grupo
-- Logo del grupo (archivo de la app en public/groups/), que sustituye al punto
-- de color allí donde aparece el grupo. Sin imagen se sigue usando el color.
-- =============================================================================

alter table public.groups
  add column image text
    constraint image_path check (image ~ '^/groups/[a-z0-9_-]+\.(png|webp|jpg)$');

update public.groups set image = '/groups/semilla.png' where name = 'Semilla';
update public.groups set image = '/groups/brote.png'   where name = 'Brote';
update public.groups set image = '/groups/raiz.png'    where name = 'Raíz';
update public.groups set image = '/groups/bloco.png'   where name = 'Bloco';
