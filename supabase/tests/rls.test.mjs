// Tests de la base de datos (RLS, roles, RPC) con PGlite: Postgres en WebAssembly.
// Simula lo mínimo de Supabase (auth.uid, roles, storage). Uso: npm run test:db
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readFileSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const db = new PGlite({ extensions: { pgcrypto } })

// --- Simulación mínima del entorno Supabase ---
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create schema extensions;
  create extension pgcrypto with schema extensions;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}',
    encrypted_password text, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text default auth.uid()::text, metadata jsonb);
  create publication supabase_realtime;
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  grant usage on schema public, auth, storage to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant all on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  -- pg_net simulado: guarda las llamadas para comprobar qué avisos se envían
  create schema net;
  create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{}', timeout_milliseconds int default 5000)
    returns bigint language sql security definer as $$ insert into net.calls (url, body, headers) values (url, body, headers) returning id $$;
  grant usage on schema net to anon, authenticated;
  -- pg_cron simulado: guarda las tareas programadas
  create schema cron;
  create table cron.job (jobname text primary key, schedule text, command text);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $$
    insert into cron.job values (job_name, schedule, command) on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning 1::bigint $$;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`)

await db.exec(readFileSync(`${ROOT}/migrations/0001_base.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0002_function_grants.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0003_announcements.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0004_announcements_author_idx.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0005_events.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0006_wall.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0007_admin.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0008_instrument_names.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0009_group_requests.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/migrations/0010_disable_invite_codes.sql`, 'utf8'))
// PGlite no tiene pg_net: se usa el simulado de arriba
await db.exec(readFileSync(`${ROOT}/migrations/0011_push.sql`, 'utf8').replace(/create extension if not exists pg_net;/i, ''))
await db.exec(readFileSync(`${ROOT}/migrations/0012_announcement_media.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/seed.sql`, 'utf8'))
await db.exec(readFileSync(`${ROOT}/seed.sql`, 'utf8')) // idempotente

let pass = 0, fail = 0
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✔', name) } else { fail++; console.log('  ✘', name, extra) }
}

async function as(uid, sql, params = [], role = 'authenticated') {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid ?? ''])
    await tx.exec(`set local role ${role}`)
    return (await tx.query(sql, params)).rows
  })
}
async function asErr(uid, sql, params = [], role) {
  try { await as(uid, sql, params, role); return null } catch (e) { return e.message }
}
const one = async (sql, p = []) => (await db.query(sql, p)).rows[0]

const mk = async (email, name) =>
  (await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, { full_name: name }])).id
const A = await mk('admin@troko.es', 'Ana Admin')
const B = await mk('b@troko.es', 'Bea')
const C = await mk('c@troko.es', 'Carlos')
const D = await mk('d@troko.es', 'Dani')
const group = async (n) => (await one(`select id from groups where name = $1`, [n])).id
const raiz = await group('Raíz'), brote = await group('Brote')

console.log('Datos iniciales')
check('5 grupos (seed repetido sin duplicar)', (await one(`select count(*)::int n from groups`)).n === 5)
check('cada grupo tiene código', (await one(`select count(*)::int n from group_invite_codes`)).n === 5)
check('perfil pendiente creado al registrarse', (await one(`select status, full_name from profiles where id=$1`, [B])).status === 'pending')
check('nombre desde metadata', (await one(`select full_name from profiles where id=$1`, [B])).full_name === 'Bea')

// make_admin.sql (sin usuario, como en el SQL Editor)
await db.exec(readFileSync(`${ROOT}/make_admin.sql`, 'utf8').replace('tu-email@ejemplo.com', 'admin@troko.es'))
check('make_admin: admin activo', (await one(`select role, status, approved_at from profiles where id=$1`, [A])).role === 'admin')
check('make_admin: approved_at puesto', !!(await one(`select approved_at from profiles where id=$1`, [A])).approved_at)

console.log('Cuenta pendiente (B)')
check('no ve grupos', (await as(B, `select * from groups`)).length === 0)
check('ve su perfil', (await as(B, `select * from profiles`)).length === 1)
check('no puede hacerse admin', /Solo un admin/.test(await asErr(B, `update profiles set role='admin' where id=$1`, [B])))
check('no puede autoaprobarse', /Solo un admin/.test(await asErr(B, `update profiles set status='active' where id=$1`, [B])))
await as(B, `update profiles set nickname='Beíta' where id=$1`, [B])
check('puede editar su apodo', (await one(`select nickname from profiles where id=$1`, [B])).nickname === 'Beíta')
check('no ve códigos', (await as(B, `select * from group_invite_codes`)).length === 0)
check('no puede editar a otro', (await as(B, `update profiles set full_name='x' where id=$1 returning id`, [C])).length === 0)

console.log('Aprobación')
check('B no puede aprobar', /Solo un admin/.test(await asErr(B, `select approve_user($1, $2)`, [C, [raiz]])))
await as(A, `select approve_user($1, $2)`, [B, [raiz]])
const pb = await one(`select status, approved_at from profiles where id=$1`, [B])
check('admin aprueba a B', pb.status === 'active' && !!pb.approved_at)
check('B en Raíz', (await one(`select count(*)::int n from group_members where user_id=$1 and group_id=$2`, [B, raiz])).n === 1)

console.log('Sin códigos de invitación (C)')
const code = (await one(`select code from group_invite_codes where group_id=$1`, [brote])).code
check('un código ya no permite entrar', /permission denied/.test(await asErr(C, `select join_with_code($1)`, [code])))
check('C sigue pendiente', (await one(`select status from profiles where id=$1`, [C])).status === 'pending')
await as(A, `select approve_user($1, $2)`, [C, [brote]])
check('C entra cuando la aprueba un admin', (await one(`select status from profiles where id=$1`, [C])).status === 'active')
check('C en Brote', (await one(`select count(*)::int n from group_members where user_id=$1`, [C])).n === 1)
check('anon no puede llamar is_admin', !!(await asErr(null, `select is_admin()`, [], 'anon')))
check('nadie llama funciones de trigger por la API', !!(await asErr(C, `select handle_new_user()`)))
check('anon no puede usar join_with_code', !!(await asErr(null, `select join_with_code($1)`, [code], 'anon')))

console.log('Miembro activo (B)')
const seen = (await as(B, `select id from profiles`)).map((r) => r.id)
check('ve perfiles activos', seen.includes(A) && seen.includes(C))
check('no ve pendientes', !seen.includes(D))
check('ve grupos', (await as(B, `select * from groups`)).length === 5)
check('ve miembros de grupos', (await as(B, `select * from group_members`)).length >= 2)
check('no crea grupos', !!(await asErr(B, `insert into groups (name) values ('Hack')`)))
check('no se añade a grupos', !!(await asErr(B, `insert into group_members (group_id, user_id) values ($1, $2)`, [brote, B])))
check('no ve emails', /Solo un admin/.test(await asErr(B, `select * from admin_user_emails()`)))

console.log('Coordinación')
await as(A, `update group_members set role='coordinator' where user_id=$1 and group_id=$2`, [B, raiz])
check('coordinadora no regenera código', !!(await asErr(B, `select regenerate_invite_code($1)`, [raiz])))

console.log('Admin')
check('admin ve pendientes', (await as(A, `select id from profiles where status='pending'`)).length === 1)
check('admin ve emails', (await as(A, `select * from admin_user_emails()`)).length === 4)
check('admin no cambia su propio rol', /propio rol/.test(await asErr(A, `update profiles set role='member' where id=$1`, [A])))
check('ni un admin regenera códigos (ya no se usan)', !!(await asErr(A, `select regenerate_invite_code($1)`, [brote])))
await as(A, `update profiles set status='rejected' where id=$1`, [D])
check('rechazada sin approved_at', (await one(`select approved_at from profiles where id=$1`, [D])).approved_at === null)
await as(A, `insert into groups (name, color) values ('Nuevo', '#123456')`)
check('grupo nuevo recibe código', (await one(`select count(*)::int n from group_invite_codes`)).n === 6)
check('color inválido rechazado', !!(await asErr(A, `insert into groups (name, color) values ('Mal', 'azul')`)))

console.log('Storage avatares')
check('sube su avatar', (await as(B, `insert into storage.objects (bucket_id, name) values ('avatars', $1) returning id`, [`${B}/avatar.jpg`])).length === 1)
check('no sube avatar ajeno', !!(await asErr(B, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${A}/avatar.jpg`])))

console.log('Avisos')
const E = await mk('e@troko.es', 'Eva')
await as(A, `select approve_user($1, $2)`, [E, [raiz]])
const ins = (uid, title, groups, extra = '') =>
  as(uid, `insert into announcements (title, group_ids${extra ? ', author_id' : ''}) values ($1, $2${extra ? ', $3' : ''}) returning *`,
    extra ? [title, groups, extra] : [title, groups])
const general = (await ins(A, '  Bolo el sábado  ', []))[0]
check('admin publica aviso general', !!general && general.author_id === A)
check('título recortado', general.title === 'Bolo el sábado')
check('miembro ve aviso general', (await as(C, `select id from announcements`)).some((r) => r.id === general.id))
check('rechazada no ve avisos', (await as(D, `select id from announcements`)).length === 0)
check('coordinadora no publica aviso general', !!(await asErr(B, `insert into announcements (title) values ('x')`)))
check('coordinadora no publica en grupo ajeno', !!(await asErr(B, `insert into announcements (title, group_ids) values ('x', $1)`, [[brote]])))
check('coordinadora no publica en grupo propio + ajeno', !!(await asErr(B, `insert into announcements (title, group_ids) values ('x', $1)`, [[raiz, brote]])))
check('miembro no publica', !!(await asErr(C, `insert into announcements (title, group_ids) values ('x', $1)`, [[brote]])))
check('título vacío rechazado', !!(await asErr(A, `insert into announcements (title) values ('   ')`)))
check('grupo inexistente rechazado', /no válido/.test(await asErr(A, `insert into announcements (title, group_ids) values ('x', $1)`, [['00000000-0000-0000-0000-000000000000']])))
const raizAnn = (await ins(B, 'Ensayo Raíz', [raiz, raiz], A))[0]
check('coordinadora publica en su grupo (sin duplicados)', raizAnn.group_ids.length === 1)
check('no se puede falsear la autoría', raizAnn.author_id === B)
check('miembro del grupo lo ve', (await as(E, `select id from announcements where id=$1`, [raizAnn.id])).length === 1)
check('otro grupo no lo ve', (await as(C, `select id from announcements where id=$1`, [raizAnn.id])).length === 0)
check('admin ve avisos de cualquier grupo', (await as(A, `select id from announcements where id=$1`, [raizAnn.id])).length === 1)

await as(B, `update announcements set pinned = true where id=$1`, [raizAnn.id])
check('fijar no marca como editado', (await one(`select edited_at from announcements where id=$1`, [raizAnn.id])).edited_at === null)
await as(B, `update announcements set body = 'Traed agua' where id=$1`, [raizAnn.id])
check('editar el texto marca editado', !!(await one(`select edited_at from announcements where id=$1`, [raizAnn.id])).edited_at)
check('autoría no cambia al editar', (await as(A, `update announcements set author_id=$2 where id=$1 returning author_id`, [raizAnn.id, A]))[0].author_id === B)
check('coordinadora no mueve su aviso a otro grupo', !!(await asErr(B, `update announcements set group_ids=$2 where id=$1`, [raizAnn.id, [brote]])))
check('otra persona no edita', (await as(E, `update announcements set title='x' where id=$1 returning id`, [raizAnn.id])).length === 0)
check('otra persona no borra', (await as(E, `delete from announcements where id=$1 returning id`, [raizAnn.id])).length === 0)
check('coordinadora no edita aviso del admin', (await as(B, `update announcements set title='x' where id=$1 returning id`, [general.id])).length === 0)

console.log('Avisos leídos')
const mark = (uid, id, user = uid) =>
  as(uid, `insert into announcement_reads (announcement_id, user_id) values ($1, $2) on conflict do nothing returning *`, [id, user])
await mark(E, raizAnn.id)
await mark(E, raizAnn.id)
check('marcar leído (repetido sin error)', (await one(`select count(*)::int n from announcement_reads where user_id=$1`, [E])).n === 1)
check('no marca leído un aviso que no ve', !!(await asErr(C, `insert into announcement_reads (announcement_id, user_id) values ($1, $2)`, [raizAnn.id, C])))
check('no marca leído por otra persona', !!(await asErr(E, `insert into announcement_reads (announcement_id, user_id) values ($1, $2)`, [general.id, C])))
await mark(C, general.id)
check('autora ve quién ha leído su aviso', (await as(B, `select user_id from announcement_reads where announcement_id=$1`, [raizAnn.id])).length === 1)
check('miembro solo ve sus leídos', (await as(E, `select user_id from announcement_reads`)).every((r) => r.user_id === E))
check('admin ve todos los leídos', (await as(A, `select * from announcement_reads`)).length === 2)
check('anon no llama can_see_for_groups', /permission denied/.test(await asErr(null, `select can_see_for_groups('{}')`, [], 'anon')))
check('nadie llama al trigger de avisos', !!(await asErr(B, `select announcements_before_write()`)))

await as(A, `update group_members set role='member' where user_id=$1 and group_id=$2`, [B, raiz])
check('ex-coordinadora ya no edita su aviso', !!(await asErr(B, `update announcements set title='x' where id=$1`, [raizAnn.id])))
check('ex-coordinadora sí puede borrarlo', (await as(B, `delete from announcements where id=$1 returning id`, [raizAnn.id])).length === 1)
check('al borrar el aviso se borran sus leídos', (await one(`select count(*)::int n from announcement_reads where user_id=$1`, [E])).n === 0)
check('admin borra aviso general', (await as(A, `delete from announcements where id=$1 returning id`, [general.id])).length === 1)

console.log('Eventos')
await as(A, `update group_members set role='coordinator' where user_id=$1 and group_id=$2`, [B, raiz])
const t0 = '2030-03-04T18:00:00Z'
const insEv = (uid, title, groups, extra = {}) =>
  as(uid, `insert into events (title, group_ids, starts_at, ends_at, category, series_id, created_by)
            values ($1, $2, $3, $4, $5, $6, $7) returning *`,
    [title, groups, extra.starts ?? t0, extra.ends ?? null, extra.category ?? 'class', extra.series ?? null, extra.by ?? null])
const gen = (await insEv(A, 'Carnaval', [], { category: 'festival' }))[0]
check('admin crea evento general', gen.created_by === A)
check('miembro ve evento general', (await as(C, `select id from events`)).some((r) => r.id === gen.id))
check('rechazada no ve eventos', (await as(D, `select id from events`)).length === 0)
check('coordinadora no crea evento general', !!(await asErr(B, `insert into events (title, starts_at) values ('x', now())`)))
check('coordinadora no crea en grupo ajeno', !!(await asErr(B, `insert into events (title, starts_at, group_ids) values ('x', now(), $1)`, [[brote]])))
check('miembro no crea eventos', !!(await asErr(E, `insert into events (title, starts_at, group_ids) values ('x', now(), $1)`, [[raiz]])))
check('fin antes del inicio rechazado', !!(await asErr(A, `insert into events (title, starts_at, ends_at) values ('x', '2030-01-02', '2030-01-01')`)))
check('categoría inválida rechazada', !!(await asErr(A, `insert into events (title, starts_at, category) values ('x', now(), 'rave')`)))

const series = '11111111-1111-1111-1111-111111111111'
const weeks = []
for (let i = 0; i < 3; i++) {
  const d = new Date(Date.parse(t0) + i * 7 * 864e5).toISOString()
  weeks.push((await insEv(B, 'Clase Raíz', [raiz], { starts: d, series, by: A }))[0])
}
check('coordinadora crea serie en su grupo', weeks.length === 3 && weeks.every((w) => w.series_id === series))
check('no se puede falsear quién lo crea', weeks[0].created_by === B)
check('miembro del grupo ve la serie', (await as(E, `select id from events where series_id=$1`, [series])).length === 3)
check('otro grupo no ve la serie', (await as(C, `select id from events where series_id=$1`, [series])).length === 0)
check('serie no se puede cambiar', (await as(B, `update events set series_id=null where id=$1 returning series_id`, [weeks[0].id]))[0].series_id === series)
check('miembro no edita', (await as(E, `update events set title='x' where id=$1 returning id`, [weeks[0].id])).length === 0)
check('coordinadora no edita evento general', (await as(B, `update events set title='x' where id=$1 returning id`, [gen.id])).length === 0)
check('admin edita evento de la coordinadora', (await as(A, `update events set location='Local' where id=$1 returning id`, [weeks[0].id])).length === 1)

const rows = weeks.slice(1).map((w, i) => ({
  id: w.id, title: 'Clase Raíz (nuevo horario)', description: '', category: 'class', location: 'Pabellón',
  starts_at: new Date(Date.parse(w.starts_at) + 36e5).toISOString(), ends_at: null, all_day: false, group_ids: [raiz],
}))
check('miembro no edita la serie', (await as(E, `select update_event_series($1) n`, [JSON.stringify(rows)]))[0].n === 0)
check('coordinadora edita "este y siguientes"', (await as(B, `select update_event_series($1) n`, [JSON.stringify(rows)]))[0].n === 2)
const after = await one(`select title, location, starts_at, group_ids from events where id=$1`, [weeks[2].id])
check('serie: texto, hora y grupos aplicados', after.title.includes('nuevo horario') && after.location === 'Pabellón' && after.group_ids[0] === raiz &&
  new Date(after.starts_at).getTime() === Date.parse(weeks[2].starts_at) + 36e5)
check('serie: el primero no cambia', (await one(`select title from events where id=$1`, [weeks[0].id])).title === 'Clase Raíz')
check('coordinadora no mueve la serie a grupo ajeno', !!(await asErr(B, `select update_event_series($1)`, [JSON.stringify([{ ...rows[0], group_ids: [brote] }])])))

console.log('Asistencia y notas')
const rsvp = (uid, ev, st, user = uid) =>
  as(uid, `insert into event_attendance (event_id, user_id, status) values ($1, $2, $3)
           on conflict (event_id, user_id) do update set status = excluded.status returning *`, [ev, user, st])
await rsvp(E, weeks[1].id, 'yes')
await rsvp(E, weeks[1].id, 'no')
check('responder y cambiar respuesta', (await one(`select status from event_attendance where user_id=$1 and event_id=$2`, [E, weeks[1].id])).status === 'no')
check('no responde a evento que no ve', !!(await asErr(C, `insert into event_attendance (event_id, user_id, status) values ($1, $2, 'yes')`, [weeks[1].id, C])))
check('no responde por otra persona', !!(await asErr(E, `insert into event_attendance (event_id, user_id, status) values ($1, $2, 'yes')`, [gen.id, C])))
check('el grupo ve quién va', (await as(B, `select user_id from event_attendance where event_id=$1`, [weeks[1].id])).length === 1)
check('otro grupo no ve esa asistencia', (await as(C, `select * from event_attendance where event_id=$1`, [weeks[1].id])).length === 0)
check('no cambia la respuesta ajena', (await as(B, `update event_attendance set status='yes' where user_id=$1 returning *`, [E])).length === 0)
await as(B, `update events set cancelled = true where id=$1`, [weeks[2].id])
check('no se responde a un evento cancelado', !!(await asErr(E, `insert into event_attendance (event_id, user_id, status) values ($1, $2, 'yes')`, [weeks[2].id, E])))
await as(E, `insert into event_notes (event_id, user_id, note) values ($1, $2, 'Llevar el surdo')`, [weeks[1].id, E])
check('nota propia', (await as(E, `select note from event_notes`)).length === 1)
check('nadie más ve la nota', (await as(B, `select * from event_notes`)).length === 0 && (await as(A, `select * from event_notes`)).length === 0)
check('no crea notas por otra persona', !!(await asErr(B, `insert into event_notes (event_id, user_id, note) values ($1, $2, 'x')`, [weeks[1].id, E])))

console.log('Calendario .ics')
const tokE = (await as(E, `select my_calendar_token() t`))[0].t
check('token de 64 caracteres', tokE.length === 64)
check('el token no cambia al pedirlo otra vez', (await as(E, `select my_calendar_token() t`))[0].t === tokE)
const feedE = (await as(null, `select * from calendar_feed($1)`, [tokE], 'anon'))
check('feed sin sesión: generales + sus grupos', feedE.length === 4 && feedE.some((r) => r.id === gen.id))
check('feed incluye nombre de grupos y cancelados', feedE.some((r) => r.group_names?.[0] === 'Raíz') && feedE.some((r) => r.cancelled))
check('feed de un solo evento', (await as(null, `select * from calendar_feed($1, $2)`, [tokE, gen.id], 'anon')).length === 1)
const tokC = (await as(C, `select my_calendar_token() t`))[0].t
check('feed de otro grupo no incluye la serie', (await as(null, `select id from calendar_feed($1)`, [tokC], 'anon')).every((r) => !weeks.some((w) => w.id === r.id)))
check('token falso no devuelve nada', (await as(null, `select * from calendar_feed('nope')`, [], 'anon')).length === 0)
check('nadie lee la tabla de tokens', (await as(E, `select * from calendar_tokens`)).length === 0)
check('anon no pide token', !!(await asErr(null, `select my_calendar_token()`, [], 'anon')))
check('rechazada no pide token', /activa/.test(await asErr(D, `select my_calendar_token()`)))
const tokE2 = (await as(E, `select regenerate_calendar_token() t`))[0].t
check('regenerar: el enlace viejo deja de funcionar', tokE2 !== tokE && (await as(null, `select * from calendar_feed($1)`, [tokE], 'anon')).length === 0)
await as(A, `update profiles set status='rejected' where id=$1`, [E])
check('cuenta desactivada: su feed se vacía', (await as(null, `select * from calendar_feed($1)`, [tokE2], 'anon')).length === 0)
await as(A, `update profiles set status='active' where id=$1`, [E])

check('borrar la serie desde una fecha', (await as(B, `delete from events where series_id=$1 and starts_at >= $2 returning id`, [series, weeks[1].starts_at])).length === 2)
check('al borrar se borran asistencia y notas', (await one(`select (select count(*) from event_attendance where user_id=$1) + (select count(*) from event_notes where user_id=$1) n`, [E])).n == 0)

console.log('Muro')
const insPost = (uid, group, body, extra = '') =>
  as(uid, `insert into posts (group_id, body, author_id${extra ? ', video_url' : ''}) values ($1, $2, $3${extra ? ', $4' : ''}) returning *`,
    extra ? [group, body, A, extra] : [group, body, A])
const post = (await insPost(E, raiz, '  ¡Qué ensayo!  ', 'https://youtu.be/abc'))[0]
check('miembro publica en su grupo', !!post && post.author_id === E && post.body === '¡Qué ensayo!')
check('otro grupo no lo ve', (await as(C, `select id from posts`)).length === 0)
check('admin lo ve', (await as(A, `select id from posts where id=$1`, [post.id])).length === 1)
check('no publica en grupo ajeno', !!(await asErr(C, `insert into posts (group_id, body) values ($1, 'x')`, [raiz])))
check('rechazada no publica', !!(await asErr(D, `insert into posts (group_id, body) values ($1, 'x')`, [brote])))
check('vídeo sin https rechazado', !!(await asErr(E, `insert into posts (group_id, video_url) values ($1, 'javascript:alert(1)')`, [raiz])))
check('admin publica en cualquier grupo', (await as(A, `insert into posts (group_id, body) values ($1, 'Hola') returning id`, [brote])).length === 1)
await as(E, `update posts set body='¡Qué ensayazo!' where id=$1`, [post.id])
const edited = await one(`select body, edited_at, group_id from posts where id=$1`, [post.id])
check('autora edita y queda marcado', edited.body === '¡Qué ensayazo!' && !!edited.edited_at)
check('no se mueve de grupo', (await as(E, `update posts set group_id=$2 where id=$1 returning group_id`, [post.id, brote]))[0].group_id === raiz)
check('coordinadora no edita lo ajeno', (await as(B, `update posts set body='x' where id=$1 returning id`, [post.id])).length === 0)

console.log('Fotos, comentarios y reacciones')
const photoPath = `${raiz}/${post.id}/a.jpg`
check('foto con ruta correcta', (await as(E, `insert into post_photos (post_id, path, width, height, group_id) values ($1, $2, 800, 600, $3) returning group_id`, [post.id, photoPath, brote]))[0].group_id === raiz)
check('foto con ruta de otro grupo rechazada', !!(await asErr(E, `insert into post_photos (post_id, path, width, height) values ($1, $2, 800, 600)`, [post.id, `${brote}/${post.id}/b.jpg`])))
check('no añade fotos a lo ajeno', !!(await asErr(B, `insert into post_photos (post_id, path, width, height) values ($1, $2, 800, 600)`, [post.id, `${raiz}/${post.id}/c.jpg`])))
check('otro grupo no ve las fotos', (await as(C, `select * from post_photos`)).length === 0)
const com = (await as(B, `insert into post_comments (post_id, body, author_id) values ($1, ' ¡Bien! ', $2) returning *`, [post.id, E]))[0]
check('comentar (autoría y grupo automáticos)', com.author_id === B && com.group_id === raiz && com.body === '¡Bien!')
check('otro grupo no comenta', !!(await asErr(C, `insert into post_comments (post_id, body) values ($1, 'x')`, [post.id])))
check('comentario vacío rechazado', !!(await asErr(E, `insert into post_comments (post_id, body) values ($1, '  ')`, [post.id])))
const comE = (await as(E, `insert into post_comments (post_id, body) values ($1, 'Gracias') returning id`, [post.id]))[0]
check('otra persona no borra comentario ajeno', (await as(C, `delete from post_comments where id=$1 returning id`, [comE.id])).length === 0)
check('coordinación modera comentarios', (await as(B, `delete from post_comments where id=$1 returning id`, [comE.id])).length === 1)
const react = (uid, emoji) => as(uid, `insert into post_reactions (post_id, user_id, emoji) values ($1, $2, $3)
  on conflict (post_id, user_id) do update set emoji = excluded.emoji returning *`, [post.id, uid, emoji])
await react(E, '👏'); await react(E, '🔥')
check('reaccionar y cambiar de emoji', (await as(B, `select emoji from post_reactions where user_id=$1`, [E]))[0]?.emoji === '🔥')
check('emoji no permitido', !!(await asErr(B, `insert into post_reactions (post_id, user_id, emoji) values ($1, $2, '💩')`, [post.id, B])))
check('otro grupo no reacciona', !!(await asErr(C, `insert into post_reactions (post_id, user_id, emoji) values ($1, $2, '👏')`, [post.id, C])))
check('no reacciona por otra persona', !!(await asErr(B, `insert into post_reactions (post_id, user_id, emoji) values ($1, $2, '👏')`, [post.id, E])))

console.log('Storage del muro')
const up = (uid, name) => as(uid, `insert into storage.objects (bucket_id, name) values ('wall', $1) returning id`, [name])
check('miembro sube foto a su grupo', (await up(E, photoPath)).length === 1)
check('no sube a otro grupo', !!(await asErr(C, `insert into storage.objects (bucket_id, name) values ('wall', $1)`, [`${raiz}/${post.id}/z.jpg`])))
check('ruta sin publicación rechazada', !!(await asErr(E, `insert into storage.objects (bucket_id, name) values ('wall', $1)`, [`${raiz}/z.jpg`])))
check('ruta rara: se rechaza sin romper la consulta', /row-level security/.test(await asErr(E, `insert into storage.objects (bucket_id, name) values ('wall', 'hola/que/tal.jpg')`)))
check('otro grupo no ve la foto', (await as(C, `select * from storage.objects where bucket_id='wall'`)).length === 0)
check('el grupo ve la foto', (await as(B, `select * from storage.objects where bucket_id='wall'`)).length === 1)
check('otro grupo no borra la foto', (await as(C, `delete from storage.objects where name=$1 returning id`, [photoPath])).length === 0)
check('avatares siguen funcionando', (await as(E, `insert into storage.objects (bucket_id, name) values ('avatars', $1) returning id`, [`${E}/avatar.jpg`])).length === 1)

console.log('Moderación del muro')
check('miembro no borra publicación ajena', (await as(C, `delete from posts where id=$1 returning id`, [post.id])).length === 0)
check('coordinación borra la foto del storage', (await as(B, `delete from storage.objects where name=$1 returning id`, [photoPath])).length === 1)
check('coordinación borra la publicación', (await as(B, `delete from posts where id=$1 returning id`, [post.id])).length === 1)
check('se borran fotos, comentarios y reacciones', (await one(`select (select count(*) from post_photos) + (select count(*) from post_comments) + (select count(*) from post_reactions) n`)).n == 0)
const own = (await insPost(E, raiz, 'Mío'))[0]
check('autora borra lo suyo', (await as(E, `delete from posts where id=$1 returning id`, [own.id])).length === 1)

console.log('Admin: resumen y contraseñas')
await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('wall', 'x/y/z.jpg', '{"size": 300000}')`)
const stats = (await as(A, `select admin_stats() s`))[0].s
check('resumen: personas', stats.people.active >= 4 && stats.people.admins === 1 && stats.people.rejected === 1)
check('resumen: almacenamiento y base de datos', stats.storage.wall_bytes === 300000 && stats.database_bytes > 0)
check('resumen solo para admin', /Solo un admin/.test(await asErr(B, `select admin_stats()`)))
await as(A, `select admin_reset_password($1, 'NuevaClave2026')`, [C])
check('admin restablece contraseña', (await one(`select encrypted_password = extensions.crypt('NuevaClave2026', encrypted_password) ok from auth.users where id=$1`, [C])).ok)
check('coordinadora no restablece contraseñas', /Solo un admin/.test(await asErr(B, `select admin_reset_password($1, 'NuevaClave2026')`, [C])))
check('admin no restablece la suya aquí', /Perfil/.test(await asErr(A, `select admin_reset_password($1, 'NuevaClave2026')`, [A])))
check('contraseña corta rechazada', /corta/.test(await asErr(A, `select admin_reset_password($1, 'corta')`, [C])))
check('anon no restablece', !!(await asErr(null, `select admin_reset_password($1, 'NuevaClave2026')`, [C], 'anon')))

console.log('Borrar cuentas')
const ePost = (await as(E, `insert into posts (group_id, body) values ($1, 'Foto') returning id`, [raiz]))[0].id
await as(E, `insert into post_photos (post_id, path, width, height) values ($1, $2, 10, 10)`, [ePost, `${raiz}/${ePost}/f.jpg`])
await as(E, `insert into post_comments (post_id, body) values ($1, 'Mío')`, [ePost])
const bPost = (await as(B, `insert into posts (group_id, body) values ($1, 'De B') returning id`, [raiz]))[0].id
await as(E, `insert into post_comments (post_id, body) values ($1, 'Comentario de E en lo de B')`, [bPost])
const bAnn = (await as(B, `insert into announcements (title, group_ids) values ('Aviso de B', $1) returning id`, [[raiz]]))[0].id
const files = (await as(E, `select account_files($1) f`, [E]))[0].f
check('lista sus archivos (foto + miniatura)', files.length === 2 && files.includes(`${raiz}/${ePost}/f_t.jpg`))
check('otra persona no lista sus archivos', /No puedes/.test(await asErr(C, `select account_files($1)`, [E])))
check('otra persona no borra su cuenta', /No puedes/.test(await asErr(C, `select delete_account($1)`, [E])))
await as(E, `select delete_account($1)`, [E])
check('se borra su propia cuenta', !(await one(`select 1 x from auth.users where id=$1`, [E])) && !(await one(`select 1 x from profiles where id=$1`, [E])))
check('se borran sus publicaciones y comentarios', (await one(`select (select count(*) from posts where id=$1) + (select count(*) from post_comments where body like 'Comentario de E%') n`, [ePost])).n == 0)
check('lo de otras personas se queda', (await one(`select count(*)::int n from posts where id=$1`, [bPost])).n === 1)
check('la única admin no puede borrarse', /única cuenta admin/.test(await asErr(A, `select delete_account($1)`, [A])))
await as(A, `select delete_account($1)`, [B])
check('admin borra otra cuenta', !(await one(`select 1 x from profiles where id=$1`, [B])))
check('sus avisos se quedan (sin autor)', (await one(`select author_id from announcements where id=$1`, [bAnn])).author_id === null)
const aAnn = (await as(A, `insert into announcements (title) values ('De A') returning id`))[0].id
check('no se puede quitar la autoría a mano', (await as(A, `update announcements set author_id = null where id=$1 returning author_id`, [aAnn]))[0].author_id === A)
const cEv = (await as(A, `insert into events (title, starts_at) values ('Ev', now()) returning id`))[0].id
check('ni la de un evento', (await as(A, `update events set created_by = null where id=$1 returning created_by`, [cEv]))[0].created_by === A)
check('anon no borra cuentas', !!(await asErr(null, `select delete_account($1)`, [C], 'anon')))
check('admin borra el avatar ajeno', (await as(A, `delete from storage.objects where bucket_id='avatars' and name like $1 returning id`, [`${E}/%`])).length === 1)

console.log('Solicitudes para entrar en grupos')
const F = await mk('f@troko.es', 'Fede')
const G = await mk('g@troko.es', 'Gema')
await as(A, `select approve_user($1, $2)`, [F, [brote]])
await as(A, `select approve_user($1, $2)`, [G, [brote]])
check('un miembro ve todos los grupos', (await as(F, `select id from groups`)).length >= 5)
check('no ve el muro de un grupo ajeno', (await as(F, `select id from posts where group_id=$1`, [raiz])).length === 0)
await as(F, `select request_group_access($1)`, [raiz])
check('pide entrar', (await as(F, `select status from group_join_requests`))[0]?.status === 'pending')
check('pedirlo otra vez no duplica', !(await asErr(F, `select request_group_access($1)`, [raiz])) && (await one(`select count(*)::int n from group_join_requests where user_id=$1`, [F])).n === 1)
check('no puede pedir su propio grupo', /Ya estás/.test(await asErr(F, `select request_group_access($1)`, [brote])))
check('no inserta solicitudes a mano', !!(await asErr(F, `insert into group_join_requests (group_id, user_id) values ($1, $2)`, [raiz, G])))
check('no se acepta a sí misma', !!(await asErr(F, `update group_join_requests set status='pending' where user_id=$1 returning *`, [F])) || (await one(`select count(*)::int n from group_members where user_id=$1 and group_id=$2`, [F, raiz])).n === 0)
check('no ve solicitudes ajenas', (await as(G, `select * from group_join_requests`)).length === 0)
check('el admin la ve', (await as(A, `select * from group_join_requests where status='pending'`)).length === 1)
check('solo un admin resuelve', /Solo un admin/.test(await asErr(F, `select resolve_group_request($1, $2, true)`, [raiz, F])))
check('rechazada no pide sin cuenta activa', /activa/.test(await asErr(D, `select request_group_access($1)`, [raiz])))
check('no pide un grupo inexistente', /no válido/.test(await asErr(F, `select request_group_access('00000000-0000-0000-0000-000000000000')`)))
await as(A, `select resolve_group_request($1, $2, true)`, [raiz, F])
check('aceptada: ya es miembro', (await one(`select count(*)::int n from group_members where user_id=$1 and group_id=$2`, [F, raiz])).n === 1)
check('aceptada: la solicitud desaparece', (await one(`select count(*)::int n from group_join_requests where user_id=$1`, [F])).n === 0)
check('ya ve el muro del grupo', !(await asErr(F, `select id from posts where group_id=$1`, [raiz])))
await as(G, `select request_group_access($1)`, [raiz])
await as(A, `select resolve_group_request($1, $2, false)`, [raiz, G])
check('rechazada: la ve como rechazada', (await as(G, `select status from group_join_requests`))[0]?.status === 'rejected')
check('rechazada: no es miembro', (await one(`select count(*)::int n from group_members where user_id=$1 and group_id=$2`, [G, raiz])).n === 0)
check('no se resuelve dos veces', /ya no está pendiente/.test(await asErr(A, `select resolve_group_request($1, $2, true)`, [raiz, G])))
await as(G, `select request_group_access($1)`, [raiz])
check('puede volver a pedirlo', (await as(G, `select status from group_join_requests`))[0]?.status === 'pending')
check('puede cancelarla', (await as(G, `delete from group_join_requests where group_id=$1 returning *`, [raiz])).length === 1)
await as(G, `select request_group_access($1)`, [raiz])
await as(A, `select approve_user($1, $2)`, [G, [raiz]])
check('si entra por otro camino, la solicitud se borra', (await one(`select count(*)::int n from group_join_requests where user_id=$1`, [G])).n === 0)
check('anon no pide acceso', !!(await asErr(null, `select request_group_access($1)`, [raiz], 'anon')))

console.log('Notificaciones push')
const calls = async () => (await db.query(`select body from net.calls order by id`)).rows.map((r) => r.body)
const H = await mk('h@troko.es', 'Hugo')
const I = await mk('i@troko.es', 'Inés')
await as(H, `select save_push_subscription('https://push.example/h', 'k', 'a', 'test')`)
check('una cuenta pendiente puede activar avisos', (await as(H, `select endpoint from push_subscriptions`)).length === 1)
check('rechazada no puede', /No puedes/.test(await asErr(D, `select save_push_subscription('https://push.example/d', 'k', 'a')`)))
check('sin configuración no se envía nada', (await calls()).length === 0)
await db.exec(`insert into private.app_config values ('push_url', 'https://app.test/api/push'), ('push_secret', 's3cret'),
  ('vapid_public', 'PUB'), ('vapid_private', 'PRIV'), ('vapid_subject', 'mailto:hola@troko.es')`)
check('clave pública para el navegador', (await as(H, `select push_public_key() k`))[0].k === 'PUB')
check('nadie lee la configuración privada', !!(await asErr(H, `select * from private.app_config`)))
await as(A, `select approve_user($1, $2)`, [H, [raiz]])
let c = await calls()
check('aprobar la cuenta avisa (una sola vez, no también por el grupo)', c.length === 1 && c[0].kind === 'account_approved' && c[0].id1 === H)
const approved = (await as(null, `select push_prepare('s3cret', 'account_approved', $1) p`, [H], 'anon'))[0].p
check('mensaje de aprobación con sus grupos', approved.body.includes('Raíz') && approved.subscriptions.length === 1 && approved.vapid.private === 'PRIV')
check('secreto incorrecto: no autorizado', /No autorizado/.test(await asErr(null, `select push_prepare('mal', 'account_approved', $1)`, [H], 'anon')))
await as(A, `select approve_user($1, $2)`, [I, [brote]])
await as(I, `select save_push_subscription('https://push.example/i', 'k', 'a')`)
await db.exec(`delete from net.calls`)
await as(I, `select request_group_access($1)`, [raiz])
await as(A, `select resolve_group_request($1, $2, true)`, [raiz, I])
c = await calls()
check('aceptar en un grupo avisa', c.length === 1 && c[0].kind === 'group_joined' && c[0].id1 === raiz && c[0].id2 === I)
const joined = (await as(null, `select push_prepare('s3cret', 'group_joined', $1, $2) p`, [raiz, I], 'anon'))[0].p
check('mensaje "Ya estás en Raíz" solo para ella', joined.title === 'Ya estás en Raíz' && joined.subscriptions.length === 1 && joined.subscriptions[0].endpoint === 'https://push.example/i')
await db.exec(`delete from net.calls`)
const hPost = (await as(H, `insert into posts (group_id, body) values ($1, '¡Ensayo extra el sábado!') returning id`, [raiz]))[0].id
c = await calls()
check('publicar en el muro avisa', c.length === 1 && c[0].kind === 'post' && c[0].id1 === hPost)
const postMsg = (await as(null, `select push_prepare('s3cret', 'post', $1) p`, [hPost], 'anon'))[0].p
check('aviso del muro a las demás personas del grupo, no a quien publica', postMsg.title === 'Raíz' && postMsg.body.startsWith('Hugo: ¡Ensayo extra') &&
  postMsg.subscriptions.length === 1 && postMsg.subscriptions[0].endpoint === 'https://push.example/i' && postMsg.url === `/muro/${raiz}/p/${hPost}`)
const photoPost = (await as(H, `insert into posts (group_id) values ($1) returning id`, [raiz]))[0].id
await as(H, `insert into post_photos (post_id, path, width, height) values ($1, $2, 1, 1), ($1, $3, 1, 1)`, [photoPost, `${raiz}/${photoPost}/a.jpg`, `${raiz}/${photoPost}/b.jpg`])
check('sin texto: "ha compartido 2 fotos"', (await as(null, `select push_prepare('s3cret', 'post', $1) p`, [photoPost], 'anon'))[0].p.body === 'Hugo ha compartido 2 fotos')
const spotiPost = (await as(H, `insert into posts (group_id, video_url) values ($1, 'https://open.spotify.com/track/x') returning id`, [raiz]))[0].id
check('con Spotify: "ha compartido música"', (await as(null, `select push_prepare('s3cret', 'post', $1) p`, [spotiPost], 'anon'))[0].p.body === 'Hugo ha compartido música')
check('no ve suscripciones ajenas', (await as(I, `select * from push_subscriptions`)).length === 1)
await as(H, `select save_push_subscription('https://push.example/i', 'k2', 'a2')`)
check('un dispositivo compartido pasa a la última cuenta', (await one(`select user_id from push_subscriptions where endpoint='https://push.example/i'`)).user_id === H)
await as(H, `select delete_push_subscription('https://push.example/h')`)
check('desactivar borra la del dispositivo', (await one(`select count(*)::int n from push_subscriptions where endpoint='https://push.example/h'`)).n === 0)
await as(null, `select push_forget('s3cret', array['https://push.example/i'])`, [], 'anon')
check('se olvidan las caducadas', (await one(`select count(*)::int n from push_subscriptions`)).n === 0)
check('anon no guarda suscripciones', !!(await asErr(null, `select save_push_subscription('https://x', 'k', 'a')`, [], 'anon')))
check('nadie llama send_push directamente', !!(await asErr(H, `select send_push('post', gen_random_uuid())`)))

console.log('Avisos con fotos y enlaces')
// H (Raíz) e I (Brote, Raíz) de la sección anterior; A admin
await as(H, `select save_push_subscription('https://push.example/h2', 'k', 'a')`)
await db.exec(`delete from net.calls`)
const ann = (await as(A, `insert into announcements (title, body, group_ids, link_url) values ('Bolo en Vegueta', '', $1, ' https://open.spotify.com/track/x ') returning *`, [[raiz]]))[0]
check('aviso con enlace (recortado)', ann.link_url === 'https://open.spotify.com/track/x')
check('enlace sin https rechazado', !!(await asErr(A, `insert into announcements (title, link_url) values ('x', 'ftp://malo')`)))
check('un aviso nuevo envía notificación', (await calls()).some((c) => c.kind === 'announcement' && c.id1 === ann.id))
const annPath = `${ann.id}/f.jpg`
check('su autora sube la foto al bucket', (await as(A, `insert into storage.objects (bucket_id, name) values ('announcements', $1) returning id`, [annPath])).length === 1)
check('otra persona no sube fotos al aviso', !!(await asErr(H, `insert into storage.objects (bucket_id, name) values ('announcements', $1)`, [`${ann.id}/g.jpg`])))
check('ruta sin aviso rechazada', !!(await asErr(A, `insert into storage.objects (bucket_id, name) values ('announcements', 'x.jpg')`)))
await as(A, `insert into announcement_photos (announcement_id, path, width, height) values ($1, $2, 10, 10)`, [ann.id, annPath])
check('foto con ruta de otro aviso rechazada', !!(await asErr(A, `insert into announcement_photos (announcement_id, path, width, height) values ($1, $2, 10, 10)`, [ann.id, `${gen}/z.jpg`])))
check('el grupo ve la foto', (await as(H, `select * from announcement_photos where announcement_id=$1`, [ann.id])).length === 1 &&
  (await as(H, `select * from storage.objects where bucket_id='announcements'`)).length === 1)
check('otro grupo no ve ni la foto ni el archivo', (await as(C, `select * from announcement_photos`)).length === 0 && (await as(C, `select * from storage.objects where bucket_id='announcements'`)).length === 0)
const annMsg = (await as(null, `select push_prepare('s3cret', 'announcement', $1) p`, [ann.id], 'anon'))[0].p
check('notificación del aviso: título, foto y solo a su grupo', annMsg.title === 'Aviso: Bolo en Vegueta' && annMsg.body.includes('ha compartido una foto') &&
  annMsg.url === `/avisos/${ann.id}` && annMsg.subscriptions.every((s) => s.endpoint === 'https://push.example/h2') && annMsg.subscriptions.length === 1)
await as(A, `update announcements set link_url = 'https://youtu.be/abc' where id=$1`, [ann.id])
check('cambiar el enlace marca "editado"', !!(await one(`select edited_at from announcements where id=$1`, [ann.id])).edited_at)
check('al borrar el aviso se borran sus fotos', (await as(A, `delete from announcements where id=$1 returning id`, [ann.id])).length === 1 &&
  (await one(`select count(*)::int n from announcement_photos`)).n === 0)

// 0013 se aplica aquí: las secciones de arriba prueban el muro tal y como era
// (moderación, fotos, cascadas…), y esta, lo que cambia
await db.exec(readFileSync(`${ROOT}/migrations/0013_wall_admins_chat.sql`, 'utf8'))

console.log('Muro solo de admins')
// A admin; F, G, H, I en Raíz; C solo en Brote. G coordina Raíz.
await db.query(`update group_members set role='coordinator' where user_id=$1 and group_id=$2`, [G, raiz])
check('un miembro ya no publica', !!(await asErr(H, `insert into posts (group_id, body) values ($1, 'x')`, [raiz])))
check('la coordinación tampoco', !!(await asErr(G, `insert into posts (group_id, body) values ($1, 'x')`, [raiz])))
const adminPost = (await as(A, `insert into posts (group_id, body) values ($1, 'Ensayo el sábado') returning id`, [raiz]))[0].id
check('un admin publica', !!adminPost)
check('un miembro no sube fotos al muro', !!(await asErr(H, `insert into storage.objects (bucket_id, name) values ('wall', $1)`, [`${raiz}/${adminPost}/a.jpg`])))
check('un admin sí', (await as(A, `insert into storage.objects (bucket_id, name) values ('wall', $1) returning id`, [`${raiz}/${adminPost}/a.jpg`])).length === 1)
check('un miembro ve la publicación', (await as(H, `select id from posts where id=$1`, [adminPost])).length === 1)
check('un miembro no comenta', !!(await asErr(H, `insert into post_comments (post_id, body) values ($1, 'x')`, [adminPost])))
check('un admin comenta', (await as(A, `insert into post_comments (post_id, body) values ($1, 'Traed agua') returning id`, [adminPost])).length === 1)
check('un miembro reacciona', (await as(H, `insert into post_reactions (post_id, user_id, emoji) values ($1, $2, '🔥') returning emoji`, [adminPost, H])).length === 1)
check('lo ya publicado por un miembro se queda', (await one(`select count(*)::int n from posts where id=$1`, [hPost])).n === 1)
check('y su autor aún lo borra', (await as(H, `delete from posts where id=$1 returning id`, [hPost])).length === 1)

console.log('Chat del grupo')
const say = (uid, group, body) => as(uid, `insert into chat_messages (group_id, body, author_id) values ($1, $2, $3) returning *`, [group, body, A])
const msg = (await say(H, raiz, '  ¿Quién trae el surdo?  '))[0]
check('un miembro escribe (autoría y texto recortado)', msg.author_id === H && msg.body === '¿Quién trae el surdo?')
check('el grupo lo ve', (await as(I, `select id from chat_messages where id=$1`, [msg.id])).length === 1)
check('otro grupo no lo ve', (await as(C, `select id from chat_messages`)).length === 0)
check('no escribe en un grupo ajeno', !!(await asErr(C, `insert into chat_messages (group_id, body) values ($1, 'x')`, [raiz])))
check('rechazada no escribe', !!(await asErr(D, `insert into chat_messages (group_id, body) values ($1, 'x')`, [brote])))
check('un admin escribe en cualquier grupo', (await as(A, `insert into chat_messages (group_id, body) values ($1, 'Hola') returning id`, [brote])).length === 1)
check('mensaje demasiado largo rechazado', !!(await asErr(H, `insert into chat_messages (group_id, body) values ($1, $2)`, [raiz, 'x'.repeat(2001)])))
check('no se edita', (await as(H, `update chat_messages set body='editado' where id=$1 returning id`, [msg.id])).length === 0)
const chatPath = `${raiz}/${msg.id}/a.jpg`
check('sube la foto al bucket del chat', (await as(H, `insert into storage.objects (bucket_id, name) values ('chat', $1) returning id`, [chatPath])).length === 1)
check('otro grupo no sube al chat', !!(await asErr(C, `insert into storage.objects (bucket_id, name) values ('chat', $1)`, [`${raiz}/${msg.id}/b.jpg`])))
check('foto del mensaje (grupo heredado)', (await as(H, `insert into chat_photos (message_id, path, width, height, group_id) values ($1, $2, 10, 10, $3) returning group_id`, [msg.id, chatPath, brote]))[0].group_id === raiz)
check('no añade fotos a mensajes ajenos', !!(await asErr(I, `insert into chat_photos (message_id, path, width, height) values ($1, $2, 10, 10)`, [msg.id, `${raiz}/${msg.id}/c.jpg`])))
check('foto con ruta de otro grupo rechazada', !!(await asErr(H, `insert into chat_photos (message_id, path, width, height) values ($1, $2, 10, 10)`, [msg.id, `${brote}/${msg.id}/d.jpg`])))
check('el grupo ve la foto', (await as(I, `select * from chat_photos`)).length === 1 && (await as(I, `select * from storage.objects where bucket_id='chat'`)).length === 1)
check('otro grupo no ve la foto', (await as(C, `select * from chat_photos`)).length === 0 && (await as(C, `select * from storage.objects where bucket_id='chat'`)).length === 0)
check('otra persona no borra un mensaje ajeno', (await as(I, `delete from chat_messages where id=$1 returning id`, [msg.id])).length === 0)
const msg2 = (await say(I, raiz, 'Yo'))[0]
check('quien lo escribió lo borra', (await as(I, `delete from chat_messages where id=$1 returning id`, [msg2.id])).length === 1)
const chatFiles = (await as(H, `select account_chat_files($1) f`, [H]))[0].f
check('archivos del chat de una cuenta (foto + miniatura)', chatFiles.length === 2 && chatFiles.includes(`${raiz}/${msg.id}/a_t.jpg`))
check('otra persona no los lista', /No puedes/.test(await asErr(I, `select account_chat_files($1)`, [H])))
const chatStats = (await as(A, `select admin_stats() s`))[0].s
check('resumen: mensajes del chat', chatStats.content.messages === 2 && 'chat_bytes' in chatStats.storage)
check('la coordinación modera el chat', (await as(G, `delete from chat_messages where id=$1 returning id`, [msg.id])).length === 1)
check('con el mensaje se va su foto', (await one(`select count(*)::int n from chat_photos`)).n === 0)
await say(H, raiz, 'Adiós')
await as(A, `select delete_account($1)`, [H])
check('al borrar la cuenta se van sus mensajes', (await one(`select count(*)::int n from chat_messages where body='Adiós'`)).n === 0)

await db.exec(readFileSync(`${ROOT}/migrations/0014_chat_push.sql`, 'utf8'))

console.log('Notificaciones del chat')
// F, G, I en Raíz; C solo en Brote. La configuración push sigue de la sección de push.
await as(F, `select save_push_subscription('https://push.example/f', 'k', 'a')`)
await as(I, `select save_push_subscription('https://push.example/i3', 'k', 'a')`)
await as(C, `select save_push_subscription('https://push.example/c', 'k', 'a')`)
await db.exec(`delete from net.calls`)
const chatMsg = (await as(F, `insert into chat_messages (group_id, body) values ($1, '¿Ensayamos mañana?') returning id`, [raiz]))[0].id
c = await calls()
check('un mensaje del chat avisa', c.length === 1 && c[0].kind === 'chat' && c[0].id1 === chatMsg)
const chatPush = (await as(null, `select push_prepare('s3cret', 'chat', $1) p`, [chatMsg], 'anon'))[0].p
check('título del grupo, autor y texto', chatPush.title === 'Raíz · chat' && chatPush.body === 'Fede: ¿Ensayamos mañana?')
check('abre el chat del grupo', chatPush.url === `/muro/${raiz}?tab=chat`)
check('a las demás personas del grupo, no a quien escribe ni a otros grupos',
  chatPush.subscriptions.length === 1 && chatPush.subscriptions[0].endpoint === 'https://push.example/i3')
check('una etiqueta por chat que vuelve a sonar', chatPush.tag === `chat-${raiz}` && chatPush.renotify === true)
const photoMsg = (await as(I, `insert into chat_messages (group_id) values ($1) returning id`, [raiz]))[0].id
await as(I, `insert into chat_photos (message_id, path, width, height) values ($1, $2, 1, 1), ($1, $3, 1, 1)`, [photoMsg, `${raiz}/${photoMsg}/a.jpg`, `${raiz}/${photoMsg}/b.jpg`])
check('sin texto: "ha enviado 2 fotos"', (await as(null, `select push_prepare('s3cret', 'chat', $1) p`, [photoMsg], 'anon'))[0].p.body === 'Inés ha enviado 2 fotos')
const photoMsg2 = (await as(I, `insert into chat_messages (group_id) values ($1) returning id`, [raiz]))[0].id
check('sin texto y fotos aún sin guardar: "ha enviado una foto"', (await as(null, `select push_prepare('s3cret', 'chat', $1) p`, [photoMsg2], 'anon'))[0].p.body === 'Inés ha enviado una foto')
const joinedPush = (await as(null, `select push_prepare('s3cret', 'group_joined', $1, $2) p`, [raiz, I], 'anon'))[0].p
check('los demás avisos siguen con su etiqueta propia y sin volver a sonar', joinedPush.tag === `group_joined-${raiz}-${I}` && joinedPush.renotify === false)
check('nadie llama push_on_chat por la API', !!(await asErr(F, `select push_on_chat()`)))

console.log('Tipos de evento (0015)')
// Antes de migrar: un ensayo y una reunión que deben recolocarse
const oldRehearsal = (await as(A, `insert into events (title, starts_at, category) values ('Ensayo viejo', now(), 'rehearsal') returning id`))[0].id
const oldMeeting = (await as(A, `insert into events (title, starts_at, category) values ('Reunión vieja', now(), 'meeting') returning id`))[0].id
await db.exec(readFileSync(`${ROOT}/migrations/0015_event_categories.sql`, 'utf8'))
const cats = (await one(`select enum_range(null::event_category)::text[] r`)).r
check('tipos nuevos, sin ensayo ni reunión', ['class', 'no_class', 'event', 'workshop', 'gig', 'festival', 'social', 'other'].every((c) => cats.includes(c)) && !cats.includes('rehearsal') && !cats.includes('meeting'))
check('un ensayo existente pasa a clase', (await one(`select category from events where id=$1`, [oldRehearsal])).category === 'class')
check('una reunión existente pasa a otro', (await one(`select category from events where id=$1`, [oldMeeting])).category === 'other')
for (const c of ['no_class', 'event', 'workshop']) {
  check(`se crea un evento de tipo ${c}`, (await as(A, `insert into events (title, starts_at, category) values ('x', now(), $1) returning category`, [c]))[0]?.category === c)
}
check('ya no se puede usar "ensayo"', !!(await asErr(A, `insert into events (title, starts_at, category) values ('x', now(), 'rehearsal')`)))

console.log('Sin suscripción .ics (0016)')
await db.exec(readFileSync(`${ROOT}/migrations/0016_drop_calendar_feed.sql`, 'utf8'))
check('ya no existe el feed público', !!(await asErr(null, `select * from calendar_feed('x')`, [], 'anon')))
check('ni los enlaces secretos', !!(await asErr(F, `select my_calendar_token()`)) && !(await one(`select to_regclass('public.calendar_tokens') t`)).t)
check('borrar una cuenta sigue funcionando', !(await asErr(A, `select delete_account($1)`, [C])))

console.log('Cumpleaños (0017)')
// PGlite no tiene pg_cron: se usa el simulado de arriba
await db.exec(readFileSync(`${ROOT}/migrations/0017_birthdays.sql`, 'utf8').replace(/create extension if not exists pg_cron;/i, ''))
const signup = async (email, meta) => (await one(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, meta])).id
const J = await signup('j@troko.es', { full_name: 'Julia', birth_date: '2010-10-04', share_birthday: true })
const K = await signup('k@troko.es', { full_name: 'Koldo', birth_date: '1990-10-04', share_birthday: false })
const L = await signup('l@troko.es', { full_name: 'Lola', birth_date: 'no-es-fecha' })
const M = await signup('m@troko.es', { full_name: 'Mar', birth_date: '2004-02-29', share_birthday: true })
const Nn = await signup('n@troko.es', { full_name: 'Nico', birth_date: '1999-10-04', share_birthday: true })
check('al registrarse se guarda la fecha y si se comparte', (await one(`select birth_date::text d, share from birthdays where user_id=$1`, [J])).share === true)
check('sin marcar, no se comparte', (await one(`select share from birthdays where user_id=$1`, [K])).share === false)
check('una fecha no válida no impide crear la cuenta', !!(await one(`select 1 x from profiles where id=$1`, [L])) && !(await one(`select 1 x from birthdays where user_id=$1`, [L])))
await as(A, `select approve_user($1, $2)`, [J, [raiz, brote]])
await as(A, `select approve_user($1, $2)`, [K, [raiz]])
await as(A, `select approve_user($1, $2)`, [M, [brote]])
await as(A, `select approve_user($1, $2)`, [Nn, []]) // sin grupos
check('cada cual ve su fecha', (await as(J, `select birth_date from birthdays`)).length === 1)
check('nadie ve la fecha de otra persona (ni un admin)', (await as(F, `select * from birthdays where user_id=$1`, [J])).length === 0 && (await as(A, `select * from birthdays where user_id=$1`, [J])).length === 0)
check('puede cambiar si la comparte', (await as(K, `update birthdays set share = true where user_id=$1 returning share`, [K]))[0]?.share === true)
await as(K, `update birthdays set share = false where user_id=$1`, [K])
check('no puede cambiar la de otra persona', (await as(K, `update birthdays set share = false where user_id=$1 returning 1`, [J])).length === 0)
check('fecha futura rechazada', /no válida/.test(await asErr(J, `update birthdays set birth_date = current_date + 1 where user_id=$1`, [J])))
check('quien no la puso puede añadirla después', (await as(F, `insert into birthdays (birth_date, share) values ('1985-05-05', true) returning user_id`))[0]?.user_id === F)

await db.exec(`delete from net.calls`)
const made = (await one(`select birthday_announcements('2026-10-04') n`)).n
const bday = await db.query(`select * from announcements where birthday_on = '2026-10-04' order by title`)
check('felicita solo a quien comparte y está en algún grupo', made === 1 && bday.rows.length === 1 && bday.rows[0].birthday_of === J)
const jAnn = bday.rows[0]
check('título con su nombre, sin edad y sin autor', jAnn.title === '🎂 ¡Hoy es el cumpleaños de Julia!' && jAnn.author_id === null && !/\d{2}/.test(jAnn.title + jAnn.body))
check('para todos sus grupos', jAnn.group_ids.length === 2 && jAnn.group_ids.includes(raiz) && jAnn.group_ids.includes(brote))
check('llamarlo otra vez el mismo día no duplica', (await one(`select birthday_announcements('2026-10-04') n`)).n === 0)
check('el grupo lo ve en Avisos', (await as(G, `select id from announcements where id=$1`, [jAnn.id])).length === 1)
check('envía la notificación', (await calls()).some((c) => c.kind === 'announcement' && c.id1 === jAnn.id))
await as(J, `select save_push_subscription('https://push.example/j', 'k', 'a')`)
const bPush = (await as(null, `select push_prepare('s3cret', 'announcement', $1) p`, [jAnn.id], 'anon'))[0].p
check('notificación sin "Aviso:" con la felicitación', bPush.title === jAnn.title && bPush.body === jAnn.body)
check('a su grupo, pero no a quien cumple años', bPush.subscriptions.length > 0 && !bPush.subscriptions.some((x) => x.endpoint === 'https://push.example/j'))
check('29 de febrero: se felicita el 28 si el año no es bisiesto', (await one(`select birthday_announcements('2027-02-28') n`)).n === 1 &&
  (await one(`select birthday_of from announcements where birthday_on = '2027-02-28'`)).birthday_of === M)
check('y el 29 si es bisiesto', (await one(`select birthday_announcements('2028-02-28') n`)).n === 0 && (await one(`select birthday_announcements('2028-02-29') n`)).n === 1)
check('desde la app no se puede crear un aviso de cumpleaños', (await as(A, `insert into announcements (title, birthday_of, birthday_on) values ('Falso', $1, '2026-01-01') returning birthday_of`, [K]))[0].birthday_of === null)
check('ni convertir uno normal', (await as(A, `update announcements set birthday_of = $1 where id=$2 returning birthday_of`, [K, aAnn]))[0].birthday_of === null)
check('ni llamar a la función de felicitaciones', !!(await asErr(A, `select birthday_announcements()`)))
check('tarea diaria programada', (await one(`select schedule, command from cron.job where jobname = 'troko-cumpleanos'`))?.command.includes('birthday_announcements'))
check('al borrar la cuenta se borran su fecha y sus felicitaciones', !(await asErr(A, `select delete_account($1)`, [J])) &&
  (await one(`select (select count(*) from birthdays where user_id=$1) + (select count(*) from announcements where birthday_of=$1) n`, [J])).n == 0)

console.log('Instagram (0018)')
await db.exec(readFileSync(`${ROOT}/migrations/0018_instagram.sql`, 'utf8'))
const P = await signup('p@troko.es', { full_name: 'Pilar', birth_date: '1995-01-01', instagram: ' @Pilar.Troko_ ', instagram_consent: true })
const Q = await signup('q@troko.es', { full_name: 'Quique', instagram: 'quique', instagram_consent: false })
const R = await signup('r@troko.es', { full_name: 'Rosa', instagram: 'no vale!' })
const S = await signup('s@troko.es', { full_name: 'Sara' })
for (const u of [P, Q, R, S]) await as(A, `select approve_user($1, $2)`, [u, [raiz]])
check('al registrarse se guarda sin @ y en minúsculas', (await one(`select username, tag_consent from instagram where user_id=$1`, [P]))?.username === 'pilar.troko_')
check('el registro sigue guardando el cumpleaños', !!(await one(`select 1 x from birthdays where user_id=$1`, [P])))
check('sin permiso queda guardado sin permiso', (await one(`select tag_consent from instagram where user_id=$1`, [Q]))?.tag_consent === false)
check('un usuario no válido no impide crear la cuenta', !!(await one(`select 1 x from profiles where id=$1`, [R])) && !(await one(`select 1 x from instagram where user_id=$1`, [R])))
check('sin Instagram no se guarda nada', !(await one(`select 1 x from instagram where user_id=$1`, [S])))
check('cada cual ve el suyo aunque no dé permiso', (await as(Q, `select username from instagram`)).map((r) => r.username).join() === 'quique')
check('un admin ve el de quien da permiso', (await as(A, `select username from instagram where user_id=$1`, [P])).length === 1)
check('pero no el de quien no lo da', (await as(A, `select username from instagram where user_id=$1`, [Q])).length === 0)
check('el resto no ve el de nadie', (await as(G, `select * from instagram`)).length === 0 && (await as(S, `select * from instagram`)).length === 0)
check('se puede añadir después', (await as(S, `insert into instagram (username, tag_consent) values ('Sara_bloco', true) returning user_id, username`))[0]?.username === 'sara_bloco')
check('y dar o quitar el permiso', (await as(Q, `update instagram set tag_consent = true where user_id=$1 returning tag_consent`, [Q]))[0]?.tag_consent === true &&
  (await as(A, `select 1 from instagram where user_id=$1`, [Q])).length === 1)
check('no se puede cambiar el de otra persona', (await as(Q, `update instagram set username = 'otro' where user_id=$1 returning 1`, [P])).length === 0 &&
  (await as(A, `update instagram set username = 'otro' where user_id=$1 returning 1`, [P])).length === 0)
check('ni guardarlo a nombre de otra persona', (await as(R, `insert into instagram (user_id, username) values ($1, 'rosa') returning user_id`, [S]))[0]?.user_id === R)
check('usuario no válido rechazado', /no válido/.test(await asErr(Q, `update instagram set username = 'con espacios' where user_id=$1`, [Q])) &&
  /no válido/.test(await asErr(Q, `update instagram set username = '' where user_id=$1`, [Q])))
check('se puede borrar', (await as(Q, `delete from instagram where user_id=$1 returning 1`, [Q])).length === 1)
check('al borrar la cuenta se borra su Instagram', !(await asErr(A, `select delete_account($1)`, [P])) && !(await one(`select 1 x from instagram where user_id=$1`, [P])))

console.log('Trokoteca (0019)')
await db.exec(readFileSync(`${ROOT}/migrations/0019_trokoteca.sql`, 'utf8'))
const T = await signup('t@troko.es', { full_name: 'Tomás pendiente' }) // sin aprobar
// Guías, música y vídeos
const guide = (await as(A, `insert into library_items (section, title, body) values ('guide', '  Cómo afinar  ', 'Texto') returning *`))[0]
check('un admin crea una guía (título sin espacios, autor)', guide?.title === 'Cómo afinar' && guide.created_by === A)
check('un admin adjunta su PDF', (await as(A, `update library_items set file_path = $2, file_name = 'afinar.pdf' where id=$1 returning file_path`, [guide.id, `guides/${guide.id}/afinar.pdf`]))[0]?.file_path === `guides/${guide.id}/afinar.pdf`)
check('ruta de PDF de otra guía rechazada', /no válida/.test(await asErr(A, `update library_items set file_path = 'guides/otra/x.pdf' where id=$1`, [guide.id])))
check('música sin enlace rechazada', !!(await asErr(A, `insert into library_items (section, title) values ('music', 'Sin enlace')`)))
check('música o vídeo no llevan PDF', !!(await asErr(A, `insert into library_items (section, title, link_url, file_path) values ('video', 'x', 'https://youtu.be/abcdefghijk', 'guides/x/y.pdf')`)))
check('enlace que no es https rechazado', !!(await asErr(A, `insert into library_items (section, title, link_url) values ('music', 'x', 'http://x.com')`)))
const song = (await as(A, `insert into library_items (section, title, link_url) values ('music', 'Samba reggae', 'https://open.spotify.com/track/abcdefghij') returning id`))[0]
check('miembros activos ven la Trokoteca', (await as(Q, `select id from library_items`)).length === 2)
check('una cuenta pendiente no', (await as(T, `select id from library_items`)).length === 0)
check('un miembro no puede publicar', !!(await asErr(Q, `insert into library_items (section, title, body) values ('guide', 'x', '')`)))
check('ni editar', (await as(Q, `update library_items set title = 'hack' where id=$1 returning 1`, [guide.id])).length === 0)
check('ni borrar', (await as(Q, `delete from library_items where id=$1 returning 1`, [song.id])).length === 0)
check('un coordinador tampoco', !!(await asErr(B, `insert into library_items (section, title, body) values ('guide', 'x', '')`)))
check('un admin edita sin cambiar el autor', (await as(A, `update library_items set title = 'Afinar', created_by = $2 where id=$1 returning title, created_by`, [guide.id, Q]))[0]?.created_by === A)
check('un admin borra', (await as(A, `delete from library_items where id=$1 returning 1`, [song.id])).length === 1)

// Productos
const shirt = (await as(A, `insert into merch_products (name, price_cents, sizes) values ('Camiseta', 1500, array[' S','M','M','', 'L']) returning *`))[0]
check('un admin crea un producto (tallas limpias y en orden)', shirt?.sizes.join() === 'S,M,L')
const bag = (await as(A, `insert into merch_products (name, price_cents) values ('Bolsa', 800) returning *`))[0]
check('un miembro ve el catálogo', (await as(Q, `select id from merch_products`)).length === 2)
check('pero no crea productos', !!(await asErr(Q, `insert into merch_products (name, price_cents) values ('x', 1)`)))
check('ni cambia precios', (await as(Q, `update merch_products set price_cents = 1 where id=$1 returning 1`, [shirt.id])).length === 0)
check('foto de otro producto rechazada', /no válida/.test(await asErr(A, `update merch_products set photo_path = $2 where id=$1`, [shirt.id, `merch/${bag.id}/x.jpg`])))

// Pedidos
const order = (await as(Q, `insert into merch_orders (product_id, size, quantity, product_name, unit_price_cents, status, user_id) values ($1, 'M', 2, 'Gratis', 0, 'delivered', $2) returning *`, [shirt.id, S]))[0]
check('un miembro pide: nombre, precio, estado y dueño los pone la base de datos', order?.user_id === Q && order.product_name === 'Camiseta' && order.unit_price_cents === 1500 && order.status === 'pending')
check('sin talla, si el producto tiene tallas, rechazado', /talla/.test(await asErr(Q, `insert into merch_orders (product_id, quantity) values ($1, 1)`, [shirt.id])))
check('talla que no existe rechazada', /talla/.test(await asErr(Q, `insert into merch_orders (product_id, size, quantity) values ($1, 'XXL', 1)`, [shirt.id])))
check('talla única: la talla se ignora', (await as(S, `insert into merch_orders (product_id, size, quantity) values ($1, 'M', 1) returning size`, [bag.id]))[0]?.size === null)
check('cantidad fuera de rango rechazada', !!(await asErr(Q, `insert into merch_orders (product_id, size, quantity) values ($1, 'S', 0)`, [shirt.id])))
await as(A, `update merch_products set available = false where id=$1`, [bag.id])
check('producto agotado: no se puede pedir', /agotado/.test(await asErr(Q, `insert into merch_orders (product_id, quantity) values ($1, 1)`, [bag.id])))
check('una cuenta pendiente no puede pedir', !!(await asErr(T, `insert into merch_orders (product_id, size, quantity) values ($1, 'S', 1)`, [shirt.id])))
check('cada cual ve sus pedidos', (await as(Q, `select id from merch_orders`)).length === 1 && (await as(S, `select id from merch_orders`)).length === 1)
check('un admin los ve todos', (await as(A, `select id from merch_orders`)).length === 2)
check('el dueño no puede marcarlo como entregado', /cancelar/.test(await asErr(Q, `update merch_orders set status = 'delivered' where id=$1`, [order.id])))
check('ni cambiar lo pedido', (await as(Q, `update merch_orders set quantity = 9, unit_price_cents = 1 where id=$1 returning quantity, unit_price_cents`, [order.id]))[0]?.quantity === 2)
check('nadie cambia el pedido de otra persona', (await as(S, `update merch_orders set status = 'cancelled' where id=$1 returning 1`, [order.id])).length === 0)
check('un admin cambia el estado', (await as(A, `update merch_orders set status = 'ready' where id=$1 returning status`, [order.id]))[0]?.status === 'ready')
check('ya preparado, el dueño no puede cancelarlo', /cancelar/.test(await asErr(Q, `update merch_orders set status = 'cancelled' where id=$1`, [order.id])))
const order2 = (await as(Q, `insert into merch_orders (product_id, size, quantity, note) values ($1, 'L', 1, 'para mi hija') returning id`, [shirt.id]))[0]
check('pendiente, el dueño lo cancela', (await as(Q, `update merch_orders set status = 'cancelled' where id=$1 returning status`, [order2.id]))[0]?.status === 'cancelled')
check('el dueño no borra pedidos', (await as(Q, `delete from merch_orders where id=$1 returning 1`, [order2.id])).length === 0)
await as(A, `delete from merch_products where id=$1`, [shirt.id])
check('al borrar el producto el pedido se queda con su nombre y precio', (await one(`select product_id, product_name, unit_price_cents from merch_orders where id=$1`, [order.id]))?.product_name === 'Camiseta')

// Archivos
const upTk = (uid, name) => asErr(uid, `insert into storage.objects (bucket_id, name) values ('trokoteca', $1)`, [name])
check('un admin sube un PDF de guía', !(await upTk(A, `guides/${guide.id}/afinar.pdf`)))
check('un miembro no sube archivos', !!(await upTk(Q, `guides/${guide.id}/otro.pdf`)))
check('solo en guides/ o merch/', !!(await upTk(A, `otra/${guide.id}/x.pdf`)))
check('miembros activos ven los archivos', (await as(Q, `select name from storage.objects where bucket_id = 'trokoteca'`)).length === 1)
check('una cuenta pendiente no', (await as(T, `select name from storage.objects where bucket_id = 'trokoteca'`)).length === 0)
check('al borrar la cuenta se borran sus pedidos', !(await asErr(A, `select delete_account($1)`, [Q])) && !(await one(`select 1 x from merch_orders where user_id=$1`, [Q])))

console.log('Notificación de pedidos (0020)')
await db.exec(readFileSync(`${ROOT}/migrations/0020_merch_order_push.sql`, 'utf8'))
const A2 = await signup('a2@troko.es', { full_name: 'Alba Admin' })
await as(A, `select approve_user($1, $2)`, [A2, []])
await as(A, `update profiles set role = 'admin' where id=$1`, [A2])
for (const [u, ep] of [[A, 'adm-a'], [A2, 'adm-a2'], [S, 'mem-s'], [R, 'mem-r']]) await as(u, `select save_push_subscription($1, 'k', 'a')`, [`https://push.example/${ep}`])
const cap = (await as(A, `insert into merch_products (name, price_cents) values ('Gorra', 1000) returning id`))[0]
await db.exec(`delete from net.calls`)
const sOrder = (await as(S, `insert into merch_orders (product_id, quantity) values ($1, 3) returning id`, [cap.id]))[0]
check('un pedido nuevo envía la notificación', (await calls()).some((c) => c.kind === 'merch_order' && c.id1 === sOrder.id))
const oPush = (await as(null, `select push_prepare('s3cret', 'merch_order', $1) p`, [sOrder.id], 'anon'))[0].p
const eps = oPush.subscriptions.map((x) => x.endpoint.split('/').pop()).sort().join()
check('dice quién y qué ha pedido y abre Pedidos', oPush.title === 'Nuevo pedido de merch' && oPush.body === 'Sara: 3 × Gorra' && oPush.url === '/trokoteca/pedidos')
check('llega solo a los admins', eps === 'adm-a,adm-a2', eps)
const aOrder = (await as(A, `insert into merch_orders (product_id, quantity) values ($1, 1) returning id`, [cap.id]))[0]
const aEps = (await as(null, `select push_prepare('s3cret', 'merch_order', $1) p`, [aOrder.id], 'anon'))[0].p.subscriptions.map((x) => x.endpoint.split('/').pop()).join()
check('si pide un admin, no le llega a él', aEps === 'adm-a2', aEps)
await db.exec(`delete from net.calls`)
await as(A, `update merch_orders set status = 'ready' where id=$1`, [sOrder.id])
await as(A, `update merch_orders set status = 'cancelled' where id=$1`, [aOrder.id])
check('cambiar el estado no avisa a nadie', !(await calls()).some((c) => c.kind === 'merch_order'))
check('los demás avisos siguen funcionando', (await as(null, `select push_prepare('s3cret', 'announcement', $1) p`, [aAnn], 'anon'))[0].p?.title?.length > 0)

console.log('Chat sin leer (0021)')
await db.exec(readFileSync(`${ROOT}/migrations/0021_chat_reads.sql`, 'utf8'))
const unreadOf = async (u, g) => (await as(u, `select unread from my_chat_unread() where group_id=$1`, [g]))[0]?.unread ?? 0
const write = (u, g, body) => as(u, `insert into chat_messages (group_id, body) values ($1, $2)`, [g, body])
// Que los mensajes ya existentes queden leídos para empezar de cero
await as(S, `select mark_chat_read($1)`, [raiz])
await as(R, `select mark_chat_read($1)`, [raiz])
await write(R, raiz, 'Uno')
await write(R, raiz, 'Dos')
await write(S, raiz, 'Mío')
check('cuenta los mensajes de otras personas', (await unreadOf(S, raiz)) === 2)
check('los míos no cuentan', (await unreadOf(R, raiz)) === 1)
await as(S, `select mark_chat_read($1)`, [raiz])
check('al abrir el chat queda a cero', (await unreadOf(S, raiz)) === 0)
check('solo veo mis lecturas', (await as(R, `select * from chat_reads where user_id=$1`, [S])).length === 0)
check('no se escribe directamente', !!(await asErr(S, `insert into chat_reads (user_id, group_id) values ($1, $2)`, [S, brote])))
check('marcar un grupo ajeno no hace nada', !(await asErr(S, `select mark_chat_read($1)`, [brote])) && !(await one(`select 1 x from chat_reads where user_id=$1 and group_id=$2`, [S, brote])))
check('solo grupos de los que soy miembro', (await as(S, `select group_id from my_chat_unread()`)).every((r) => r.group_id === raiz))
const N2 = await signup('n2@troko.es', { full_name: 'Nuevo' })
await as(A, `select approve_user($1, $2)`, [N2, [raiz]])
check('al entrar en un grupo no le salen los mensajes antiguos', (await unreadOf(N2, raiz)) === 0)
await write(R, raiz, 'Bienvenido')
check('pero sí los nuevos', (await unreadOf(N2, raiz)) === 1)
check('anon no puede', !!(await asErr(null, `select * from my_chat_unread()`, [], 'anon')) && !!(await asErr(null, `select mark_chat_read($1)`, [raiz], 'anon')))

console.log('Comentarios en felicitaciones (0022)')
await db.exec(readFileSync(`${ROOT}/migrations/0022_birthday_comments.sql`, 'utf8'))
// Felicitación de Mar (grupo Brote) del 28-02-2027
const mAnn = (await one(`select id from announcements where birthday_of = $1 order by birthday_on limit 1`, [M])).id
const bMate = (await one(`select m.user_id from group_members m join profiles p on p.id = m.user_id where m.group_id = $1 and m.user_id <> $2 and p.status = 'active' and p.role <> 'admin' limit 1`, [brote, M])).user_id
const comment = (u, ann, body) => as(u, `insert into announcement_comments (announcement_id, body, author_id) values ($1, $2, $3) returning *`, [ann, body, A])
const c1 = (await comment(bMate, mAnn, '  ¡Felicidades! 🎉  '))[0]
check('alguien de su grupo comenta la felicitación (autor y texto los pone la base de datos)', c1?.author_id === bMate && c1.body === '¡Felicidades! 🎉')
check('quien cumple años también puede contestar', (await comment(M, mAnn, '¡Gracias!')).length === 1)
check('en un aviso normal no se puede comentar', !!(await asErr(A, `insert into announcement_comments (announcement_id, body) values ($1, 'hola')`, [aAnn])))
check('fuera de sus grupos no se puede comentar', !!(await asErr(N2, `insert into announcement_comments (announcement_id, body) values ($1, 'hola')`, [mAnn])))
check('ni ver los comentarios', (await as(N2, `select id from announcement_comments`)).length === 0)
check('una cuenta pendiente no comenta', !!(await asErr(T, `insert into announcement_comments (announcement_id, body) values ($1, 'hola')`, [mAnn])))
check('comentario vacío rechazado', !!(await asErr(M, `insert into announcement_comments (announcement_id, body) values ($1, '   ')`, [mAnn])))
check('el grupo ve los comentarios', (await as(M, `select id from announcement_comments where announcement_id=$1`, [mAnn])).length === 2)
check('no se pueden editar', (await as(bMate, `update announcement_comments set body = 'x' where id=$1 returning 1`, [c1.id])).length === 0)
check('nadie borra el comentario de otra persona', (await as(M, `delete from announcement_comments where id=$1 returning 1`, [c1.id])).length === 0)
check('un admin sí', (await as(A, `delete from announcement_comments where id=$1 returning 1`, [c1.id])).length === 1)
const c2 = (await comment(bMate, mAnn, 'Otra vez'))[0]
check('y su autor/a también', (await as(bMate, `delete from announcement_comments where id=$1 returning 1`, [c2.id])).length === 1)
check('anon no ve nada', !!(await asErr(null, `select * from announcement_comments`, [], 'anon')) || (await as(null, `select * from announcement_comments`, [], 'anon')).length === 0)

console.log('Imagen de los grupos (0023)')
await db.exec(readFileSync(`${ROOT}/migrations/0023_group_images.sql`, 'utf8'))
check('Semilla, Brote, Raíz y Bloco tienen su imagen', (await one(`select count(*)::int n from groups where image is not null`)).n === 4)
await db.exec(readFileSync(`${ROOT}/migrations/0024_timbau_image.sql`, 'utf8'))
check('y Timbau también (0024)', (await one(`select image from groups where name = 'Timbau'`)).image === '/groups/timbau.png')
check('los miembros la ven', (await as(M, `select image from groups where id=$1`, [brote]))[0]?.image === '/groups/brote.png')
check('solo rutas de la app', !!(await asErr(A, `update groups set image = 'https://malo.example/x.png' where id=$1`, [raiz])))

console.log('Colores de los grupos (0025)')
await db.exec(readFileSync(`${ROOT}/migrations/0025_group_colors.sql`, 'utf8'))
check('cada grupo con el color de su logo', (await one(`select color from groups where name = 'Timbau'`)).color === '#8E3FB0' && (await one(`select count(*)::int n from groups where color in ('#F1AC0F', '#E6551E', '#94CE2E', '#0BBBEE', '#8E3FB0')`)).n === 5)

console.log('Sobre mí (0026)')
await db.exec(readFileSync(`${ROOT}/migrations/0026_profile_bio.sql`, 'utf8'))
check('cada cual escribe su descripción', (await as(S, `update profiles set bio = 'Toco la caja desde 2019' where id=$1 returning bio`, [S]))[0]?.bio === 'Toco la caja desde 2019')
check('la ven las demás cuentas activas', (await as(R, `select bio from profiles where id=$1`, [S]))[0]?.bio === 'Toco la caja desde 2019')
check('una cuenta pendiente no', (await as(T, `select bio from profiles where id=$1`, [S])).length === 0)
check('nadie cambia la de otra persona', (await as(R, `update profiles set bio = 'x' where id=$1 returning 1`, [S])).length === 0)
check('máximo 300 caracteres', !!(await asErr(S, `update profiles set bio = repeat('a', 301) where id=$1`, [S])))

console.log('Grupo Mistura (0027)')
await db.exec(readFileSync(`${ROOT}/migrations/0027_group_mistura.sql`, 'utf8'))
const mistura = await one(`select * from groups where name = 'Mistura'`)
check('existe con su horario, color y logo', mistura?.schedule === 'Martes 11:30' && mistura.color === '#56CBC6' && mistura.image === '/groups/mistura.png')
await db.exec(readFileSync(`${ROOT}/migrations/0027_group_mistura.sql`, 'utf8'))
check('aplicarla otra vez no lo duplica', (await one(`select count(*)::int n from groups where name = 'Mistura'`)).n === 1)
check('lo ven las cuentas activas para pedir entrar', (await as(S, `select id from groups where id=$1`, [mistura.id])).length === 1)

console.log('Fotos de los grupos (0028)')
await db.exec(readFileSync(`${ROOT}/migrations/0028_group_image_uploads.sql`, 'utf8'))
const upG = (uid, name) => asErr(uid, `insert into storage.objects (bucket_id, name) values ('groups', $1)`, [name])
check('un admin sube la foto de un grupo', !(await upG(A, `${raiz}/1700000000000.jpg`)))
check('un miembro no', !!(await upG(S, `${raiz}/1700000000001.jpg`)))
check('un miembro no borra fotos', (await as(S, `delete from storage.objects where bucket_id = 'groups' returning 1`)).length === 0)
const url = `https://qkbncnflfbwbpfbsywbq.supabase.co/storage/v1/object/public/groups/${raiz}/1700000000000.jpg`
check('el grupo puede usar esa foto', (await as(A, `update groups set image = $1 where id=$2 returning image`, [url, raiz]))[0]?.image === url)
check('los logos de la app siguen valiendo', !(await asErr(A, `update groups set image = '/groups/raiz.png' where id=$1`, [raiz])))
check('una URL de otra web no', !!(await asErr(A, `update groups set image = 'https://malo.example/groups/x.jpg' where id=$1`, [raiz])))
check('ni de otro bucket', !!(await asErr(A, `update groups set image = $1 where id=$2`, [url.replace('/public/groups/', '/public/avatars/'), raiz])))
check('un miembro no cambia la foto del grupo', (await as(S, `update groups set image = null where id=$1 returning 1`, [raiz])).length === 0)

console.log('Reacciones del chat (0029)')
await db.exec(readFileSync(`${ROOT}/migrations/0029_chat_reactions.sql`, 'utf8'))
const rMsg = (await as(R, `insert into chat_messages (group_id, body) values ($1, 'Reaccionad') returning id`, [raiz]))[0].id
const chatReact = (u, e) => as(u, `insert into chat_reactions (message_id, emoji, user_id, group_id) values ($1, $2, $3, $4) on conflict (message_id, user_id) do update set emoji = excluded.emoji returning *`, [rMsg, e, A, brote])
const r1 = (await chatReact(S, '👏'))[0]
check('alguien del grupo reacciona (quién y grupo los pone la base de datos)', r1?.user_id === S && r1.group_id === raiz)
check('cambiar de emoji', (await chatReact(S, '🥁'))[0]?.emoji === '🥁' && (await as(S, `select count(*)::int n from chat_reactions where message_id=$1`, [rMsg]))[0].n === 1)
check('emoji no permitido rechazado', !!(await asErr(N2, `insert into chat_reactions (message_id, emoji) values ($1, '💩')`, [rMsg])))
check('fuera del grupo no se reacciona', !!(await asErr(M, `insert into chat_reactions (message_id, emoji) values ($1, '👏')`, [rMsg])))
check('ni se ven las reacciones', (await as(M, `select 1 from chat_reactions where message_id=$1`, [rMsg])).length === 0)
check('el grupo las ve', (await as(R, `select emoji from chat_reactions where message_id=$1`, [rMsg])).length === 1)
check('nadie quita la reacción de otra persona', (await as(R, `delete from chat_reactions where message_id=$1 and user_id=$2 returning 1`, [rMsg, S])).length === 0)
check('cada cual quita la suya', (await as(S, `delete from chat_reactions where message_id=$1 returning 1`, [rMsg])).length === 1)
await chatReact(S, '❤️')
await as(R, `delete from chat_messages where id=$1`, [rMsg])
check('al borrar el mensaje se van sus reacciones', !(await one(`select 1 x from chat_reactions where message_id=$1`, [rMsg])))

console.log('Encuestas (0030)')
await db.exec(readFileSync(`${ROOT}/migrations/0030_polls.sql`, 'utf8'))
const pMsg = (await as(S, `insert into chat_messages (group_id, body) values ($1, '') returning id`, [raiz]))[0].id
const mkPoll = (u, col, id, opts, multiple = false) =>
  as(u, `insert into polls (${col}, question, options, multiple) values ($1, ' ¿Quién viene al bolo? ', $2, $3) returning *`, [id, opts, multiple])
const poll = (await mkPoll(S, 'message_id', pMsg, [' Voy ', 'No puedo', 'Quizá']))[0]
check('quien escribe el mensaje crea la encuesta (textos recortados)', poll?.created_by === S && poll.question === '¿Quién viene al bolo?' && poll.options[0] === 'Voy')
check('no en el mensaje de otra persona', !!(await asErr(R, `insert into polls (message_id, question, options) values ($1, 'x', '{a,b}')`, [pMsg])))
check('al menos dos respuestas', !!(await asErr(R, `insert into polls (message_id, question, options) values ($1, 'x', '{a}')`, [(await as(R, `insert into chat_messages (group_id, body) values ($1, '') returning id`, [raiz]))[0].id])))
check('sin respuestas vacías', /80/.test(await asErr(S, `insert into polls (message_id, question, options) values ($1, 'x', $2)`, [(await as(S, `insert into chat_messages (group_id, body) values ($1, '') returning id`, [raiz]))[0].id, ['a', '  ']])))
const vote = (u, pollId, o) => as(u, `insert into poll_votes (poll_id, option, user_id) values ($1, $2, $3) returning *`, [pollId, o, A])
check('el grupo vota (a su nombre)', (await vote(R, poll.id, 0))[0]?.user_id === R)
await vote(R, poll.id, 2)
check('voto único: cambiar de respuesta sustituye el voto', (await as(R, `select option from poll_votes where poll_id=$1 and user_id=$2`, [poll.id, R])).map((v) => v.option).join() === '2')
check('respuesta que no existe rechazada', /no existe/.test(await asErr(S, `insert into poll_votes (poll_id, option) values ($1, 3)`, [poll.id])))
check('fuera del grupo no se ve ni se vota', (await as(M, `select 1 from polls where id=$1`, [poll.id])).length === 0 && !!(await asErr(M, `insert into poll_votes (poll_id, option) values ($1, 0)`, [poll.id])))
check('se ve quién ha votado', (await as(S, `select user_id from poll_votes where poll_id=$1`, [poll.id]))[0]?.user_id === R)
check('nadie quita el voto de otra persona', (await as(S, `delete from poll_votes where poll_id=$1 and user_id=$2 returning 1`, [poll.id, R])).length === 0)
check('no se puede cambiar la pregunta', /cerrar/.test(await asErr(S, `update polls set question = 'Otra' where id=$1`, [poll.id])))
check('otra persona no la cierra', (await as(R, `update polls set closed_at = now() where id=$1 returning 1`, [poll.id])).length === 0)
check('su autor/a la cierra', !!(await as(S, `update polls set closed_at = now() where id=$1 returning closed_at`, [poll.id]))[0]?.closed_at)
check('cerrada: no se vota', /cerrada/.test(await asErr(N2, `insert into poll_votes (poll_id, option) values ($1, 0)`, [poll.id])))
check('ni se quita el voto', /cerrada/.test(await asErr(R, `delete from poll_votes where poll_id=$1`, [poll.id])))
// En avisos: quien lo escribe o un admin, con varias respuestas
const annP = (await as(A, `insert into announcements (title, group_ids) values ('Taller', $1) returning id`, [[raiz]]))[0].id
check('en un aviso, solo su autor/a o un admin', !!(await asErr(S, `insert into polls (announcement_id, question, options) values ($1, 'x', '{a,b}')`, [annP])))
const aPoll = (await mkPoll(A, 'announcement_id', annP, ['Sábado', 'Domingo'], true))[0]
check('un admin la crea en su aviso', aPoll?.announcement_id === annP)
await vote(S, aPoll.id, 0)
await vote(S, aPoll.id, 1)
check('varias respuestas: se guardan las dos', (await as(S, `select count(*)::int n from poll_votes where poll_id=$1 and user_id=$2`, [aPoll.id, S]))[0].n === 2)
check('quien no ve el aviso no ve la encuesta', (await as(M, `select 1 from polls where id=$1`, [aPoll.id])).length === 0)
check('una encuesta no puede ir en aviso y mensaje a la vez', !!(await asErr(A, `insert into polls (announcement_id, message_id, question, options) values ($1, $2, 'x', '{a,b}')`, [annP, pMsg])))
await as(A, `delete from announcements where id=$1`, [annP])
check('al borrar el aviso se borra la encuesta y sus votos', !(await one(`select 1 x from polls where id=$1`, [aPoll.id])) && !(await one(`select 1 x from poll_votes where poll_id=$1`, [aPoll.id])))

console.log('Menciones y avisos de pedidos (0031)')
await db.exec(readFileSync(`${ROOT}/migrations/0031_mentions_merch_push.sql`, 'utf8'))
await db.exec(`delete from net.calls`)
const men = (await as(S, `insert into chat_messages (group_id, body, mentions) values ($1, 'Hola @Rosa', $2) returning *`, [raiz, [R, R, S, M, T]]))[0]
check('solo se guardan menciones a gente activa del grupo, sin repetir y sin quien escribe', men.mentions.join() === R)
const mc = await calls()
check('envía la notificación del chat y la de la mención', mc.some((c) => c.kind === 'chat' && c.id1 === men.id) && mc.some((c) => c.kind === 'chat_mention' && c.id1 === men.id))
const mPush = (await as(null, `select push_prepare('s3cret', 'chat_mention', $1) p`, [men.id], 'anon'))[0].p
check('"Sara te ha mencionado", solo a Rosa', mPush.title === 'Sara te ha mencionado' && mPush.subscriptions.map((x) => x.endpoint.split('/').pop()).join() === 'mem-r')
const cPush = (await as(null, `select push_prepare('s3cret', 'chat', $1) p`, [men.id], 'anon'))[0].p
check('la del chat ya no le llega a Rosa', !cPush.subscriptions.some((x) => x.endpoint.endsWith('/mem-r')))
await db.exec(`delete from net.calls`)
const plain = (await as(S, `insert into chat_messages (group_id, body) values ($1, 'Sin menciones') returning id`, [raiz]))[0].id
check('sin menciones, solo la del chat', (await calls()).filter((c) => c.id1 === plain).map((c) => c.kind).join() === 'chat')
check('la del chat de un mensaje con encuesta lo dice', (await as(null, `select push_prepare('s3cret', 'chat', $1) p`, [pMsg], 'anon'))[0].p.body === 'Sara ha creado una encuesta: ¿Quién viene al bolo?')
// Pedidos
const cap2 = (await as(A, `insert into merch_products (name, price_cents) values ('Chapa', 200) returning id`))[0]
const ord = (await as(S, `insert into merch_orders (product_id, quantity) values ($1, 2) returning id`, [cap2.id]))[0]
await db.exec(`delete from net.calls`)
await as(A, `update merch_orders set status = 'ready' where id=$1`, [ord.id])
check('al marcarlo como listo se avisa a quien lo pidió', (await calls()).some((c) => c.kind === 'merch_status' && c.id1 === ord.id))
const sPush = (await as(null, `select push_prepare('s3cret', 'merch_status', $1) p`, [ord.id], 'anon'))[0].p
check('"¡Tu pedido está listo!", solo a esa persona, abre Merch', sPush.title === '¡Tu pedido está listo!' && sPush.body === '2 × Chapa. Ya puedes recogerlo.' && sPush.url === '/trokoteca?tab=merch' && sPush.subscriptions.map((x) => x.endpoint.split('/').pop()).join() === 'mem-s')
await db.exec(`delete from net.calls`)
await as(A, `update merch_orders set status = 'delivered' where id=$1`, [ord.id])
check('entregado no avisa', !(await calls()).some((c) => c.kind === 'merch_status'))
const ord2 = (await as(S, `insert into merch_orders (product_id, quantity) values ($1, 1) returning id`, [cap2.id]))[0]
await db.exec(`delete from net.calls`)
await as(S, `update merch_orders set status = 'cancelled' where id=$1`, [ord2.id])
check('si lo cancela quien lo pidió, no se le avisa', !(await calls()).some((c) => c.kind === 'merch_status'))
const ord3 = (await as(S, `insert into merch_orders (product_id, quantity) values ($1, 1) returning id`, [cap2.id]))[0]
await as(A, `update merch_orders set status = 'cancelled' where id=$1`, [ord3.id])
check('si lo cancela un admin, sí', (await as(null, `select push_prepare('s3cret', 'merch_status', $1) p`, [ord3.id], 'anon'))[0].p.title === 'Pedido cancelado')
check('el aviso de pedido nuevo para admins sigue igual', (await as(null, `select push_prepare('s3cret', 'merch_order', $1) p`, [ord3.id], 'anon'))[0].p.title === 'Nuevo pedido de merch')

console.log(`\n${pass} OK, ${fail} fallos`)
process.exit(fail ? 1 : 0)
