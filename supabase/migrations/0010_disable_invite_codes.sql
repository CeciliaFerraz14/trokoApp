-- =============================================================================
-- Troko Bloco · Migración 0010 · Sin códigos de invitación
-- Las cuentas nuevas las aprueba siempre un admin desde la app, y para entrar
-- en un grupo se pide acceso (0009). Los códigos ya no se muestran en la app;
-- aquí se desactivan para que un código antiguo no permita saltarse la
-- aprobación. La tabla y las funciones se quedan (sin uso) por si se
-- quisieran recuperar.
-- =============================================================================
revoke execute on function public.join_with_code(text) from anon, authenticated, public;
revoke execute on function public.regenerate_invite_code(uuid) from anon, authenticated, public;
