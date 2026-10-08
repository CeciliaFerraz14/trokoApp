-- =============================================================================
-- Troko Bloco · Migración 0024 · Imagen de Timbau
-- Logo como los demás: anillo y flor de Troko, con el personaje del timbau dentro de la flor
-- (original a 1080 px en logos/timbau-1080.png).
-- =============================================================================

update public.groups set image = '/groups/timbau.png' where name = 'Timbau';
