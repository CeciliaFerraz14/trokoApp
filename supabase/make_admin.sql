-- =============================================================================
-- Convertir una cuenta en admin (y aprobarla).
-- 1. Regístrate primero en la app con tu email.
-- 2. Cambia el email de abajo y ejecuta esto en Supabase → SQL Editor.
-- =============================================================================
update public.profiles
set role = 'admin', status = 'active'
where id = (select id from auth.users where email = 'tu-email@ejemplo.com');

-- Comprobación: debe devolver una fila con role = admin
select p.full_name, u.email, p.role, p.status
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'admin';
