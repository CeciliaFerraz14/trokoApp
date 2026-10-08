-- =============================================================================
-- Troko Bloco · Migración 0027 · Grupo nuevo: Mistura
-- Clases los martes a las 11:30. Logo en public/groups/mistura.png y color del
-- fondo del logo, como el resto (0023, 0025). Va el último en la lista.
-- =============================================================================

insert into public.groups (name, schedule, color, image, sort_order)
select 'Mistura', 'Martes 11:30', '#56CBC6', '/groups/mistura.png', 60
where not exists (select 1 from public.groups where name = 'Mistura' and archived_at is null);
