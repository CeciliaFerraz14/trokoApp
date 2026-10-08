-- =============================================================================
-- Troko Bloco · Migración 0024 · Imagen de Timbau
-- Logo hecho con el anillo de los demás grupos y el personaje del timbau
-- (original a 1080 px en logos/timbau-1080.png).
-- =============================================================================

update public.groups set image = '/groups/timbau.png' where name = 'Timbau';
