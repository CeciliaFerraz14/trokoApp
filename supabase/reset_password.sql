-- =============================================================================
-- Restablecer la contraseña de una persona (mientras no haya email configurado).
-- Cambia el email y la contraseña temporal, ejecútalo en Supabase → SQL Editor
-- y díselo a la persona. Después puede cambiarla en Perfil → Cambiar contraseña.
-- =============================================================================
update auth.users
set encrypted_password = extensions.crypt('ContraseñaTemporal123', extensions.gen_salt('bf')),
    updated_at = now()
where email = 'persona@ejemplo.com';
