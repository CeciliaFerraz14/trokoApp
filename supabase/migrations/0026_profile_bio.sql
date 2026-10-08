-- =============================================================================
-- Troko Bloco · Migración 0026 · "Sobre mí"
-- Descripción corta que cada persona escribe en su perfil y que se ve en su
-- ficha (al tocarla en Miembros o en el chat). La ven las cuentas activas,
-- como el resto del perfil (policy "profiles: ver").
-- =============================================================================

alter table public.profiles
  add column bio text
    constraint bio_length check (char_length(bio) <= 300);
