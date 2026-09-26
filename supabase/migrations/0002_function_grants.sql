-- =============================================================================
-- Troko Bloco · Migración 0002 · Permisos de funciones
-- Supabase concede EXECUTE a anon y authenticated en toda función nueva de
-- public, lo que las expone en /rest/v1/rpc/…
-- - Funciones de trigger: nadie debe llamarlas por la API (los triggers se
--   disparan igual sin EXECUTE).
-- - Funciones de permisos: las usan las políticas RLS de authenticated, así
--   que solo se retiran a anon.
-- =============================================================================
revoke execute on function public.handle_new_user()        from anon, authenticated, public;
revoke execute on function public.handle_new_group()       from anon, authenticated, public;
revoke execute on function public.protect_profile_fields() from anon, authenticated, public;

revoke execute on function public.is_active()                  from anon, public;
revoke execute on function public.is_admin()                   from anon, public;
revoke execute on function public.is_group_member(uuid)        from anon, public;
revoke execute on function public.is_group_coordinator(uuid)   from anon, public;
revoke execute on function public.can_manage_group(uuid)       from anon, public;
grant execute on function public.is_active()                to authenticated;
grant execute on function public.is_admin()                 to authenticated;
grant execute on function public.is_group_member(uuid)      to authenticated;
grant execute on function public.is_group_coordinator(uuid) to authenticated;
grant execute on function public.can_manage_group(uuid)     to authenticated;
