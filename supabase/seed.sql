-- =============================================================================
-- Troko Bloco · Datos iniciales (grupos actuales)
-- Ejecutar después de las migraciones. Se puede repetir sin duplicar.
-- Los eventos de ejemplo de septiembre se añaden en la fase 3.
-- =============================================================================
insert into public.groups (name, description, color, sort_order, schedule) values
  ('Semilla',  'Clases regulares de batucada · nivel iniciación',   '#9ADCF7', 10, 'Martes 19:30 · Miércoles 18:00'),
  ('Brote',    'Clases regulares de batucada · nivel básico',       '#4FC3F7', 20, 'Lunes 19:45'),
  ('Raíz',     'Clases regulares de batucada · nivel intermedio',   '#29B6F6', 30, 'Lunes 18:30'),
  ('Bloco',    'Clases regulares de batucada · nivel avanzado',     '#039BE5', 40, 'Miércoles 19:30'),
  ('Timbau',   'Clases regulares especiales de timbau',             '#8BC34A', 50, 'Martes 18:15')
on conflict (name) do nothing;
