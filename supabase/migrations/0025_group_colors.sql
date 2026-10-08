-- =============================================================================
-- Troko Bloco · Migración 0025 · Color de cada grupo = fondo de su logo
-- (la cabecera del grupo usa este color desde esta versión)
-- =============================================================================

update public.groups set color = '#F1AC0F' where name = 'Semilla';
update public.groups set color = '#E6551E' where name = 'Raíz';
update public.groups set color = '#94CE2E' where name = 'Brote';
update public.groups set color = '#0BBBEE' where name = 'Bloco';
update public.groups set color = '#8E3FB0' where name = 'Timbau';
