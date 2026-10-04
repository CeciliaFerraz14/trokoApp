-- =============================================================================
-- Troko Bloco · Migración 0016 · Sin suscripción al calendario del móvil
-- Se quita la sincronización con Apple/Google Calendar (.ics): la función
-- pública calendar_feed, los enlaces secretos y su tabla. Los calendarios ya
-- suscritos dejan de actualizarse.
-- =============================================================================

drop function if exists public.calendar_feed(text, uuid);
drop function if exists public.my_calendar_token();
drop function if exists public.regenerate_calendar_token();
drop table if exists public.calendar_tokens;
