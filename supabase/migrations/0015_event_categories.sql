-- =============================================================================
-- Troko Bloco · Migración 0015 · Tipos de evento del calendario
-- Fuera "Ensayo" y "Reunión"; nuevos "Evento", "Talleres especiales" y
-- "No hay clase". Los valores que sobran se renombran a los nuevos (así no hay
-- que rehacer el tipo ni las funciones que lo usan). Si quedara algún evento
-- con los tipos viejos, pasa a Clase (ensayo) u Otro (reunión).
-- =============================================================================

update public.events set category = 'class' where category = 'rehearsal';
update public.events set category = 'other' where category = 'meeting';

alter type public.event_category rename value 'rehearsal' to 'workshop';
alter type public.event_category rename value 'meeting' to 'event';
alter type public.event_category add value if not exists 'no_class';
