-- =============================================================================
-- Troko Bloco · Migración 0004 · Índice de autoría de avisos
-- La FK author_id → profiles (on delete set null) necesita índice para que
-- borrar una cuenta no recorra toda la tabla de avisos.
-- =============================================================================
create index announcements_author_idx on public.announcements (author_id);
