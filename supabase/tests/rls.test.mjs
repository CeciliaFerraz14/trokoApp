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

console.log('Código de invitación (C)')
const code = (await one(`select code from group_invite_codes where group_id=$1`, [brote])).code
check('código no válido', /no válido/.test(await asErr(C, `select join_with_code('ZZZZZZ')`)))
await as(C, `select join_with_code($1)`, [code.toLowerCase() + ' '])
check('C activo con código (minúsculas/espacios ok)', (await one(`select status from profiles where id=$1`, [C])).status === 'active')
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
const codes = await as(B, `select group_id from group_invite_codes`)
check('coordinadora ve código de su grupo y solo ese', codes.length === 1 && codes[0].group_id === raiz)
check('coordinadora no regenera código', /Solo un admin/.test(await asErr(B, `select regenerate_invite_code($1)`, [raiz])))

console.log('Admin')
check('admin ve pendientes', (await as(A, `select id from profiles where status='pending'`)).length === 1)
check('admin ve emails', (await as(A, `select * from admin_user_emails()`)).length === 4)
check('admin no cambia su propio rol', /propio rol/.test(await asErr(A, `update profiles set role='member' where id=$1`, [A])))
const newCode = (await as(A, `select regenerate_invite_code($1) c`, [brote]))[0].c
check('regenerar código', newCode !== code && newCode.length === 6)
check('código viejo ya no sirve', /no válido/.test(await asErr(D, `select join_with_code($1)`, [code])))
await as(A, `update groups set archived_at = now() where id=$1`, [brote])
check('grupo archivado no admite código', /no válido/.test(await asErr(D, `select join_with_code($1)`, [newCode])))
await as(A, `update groups set archived_at = null where id=$1`, [brote])
await as(A, `update profiles set status='rejected' where id=$1`, [D])
check('rechazada no entra con código', /no está autorizada/.test(await asErr(D, `select join_with_code($1)`, [newCode])))
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

console.log(`\n${pass} OK, ${fail} fallos`)
process.exit(fail ? 1 : 0)
