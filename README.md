# Troko Bloco · App de la batucada

App web instalable (PWA) para la batucada y la escuela **Troko Bloco**: avisos, calendario, muro de cada grupo y perfiles. Se instala desde el navegador (sin App Store ni Google Play).

**Stack:** React + Vite + TypeScript · Tailwind CSS v4 · React Router · TanStack Query · vite-plugin-pwa · Supabase (Auth, Postgres con RLS, Storage, Realtime) · Vercel.

---

## 1. Crear el proyecto en Supabase

1. Entra en [supabase.com](https://supabase.com) → **New project**.
   - Región: **West EU (Paris)** o **Central EU (Frankfurt)**.
   - Guarda la contraseña de la base de datos en un sitio seguro.
2. **Authentication → Sign In / Providers → Email**:
   - Deja activado **Email** (email + contraseña).
   - **Desactiva "Confirm email"**. Sin un servidor de correo propio, Supabase solo envía emails a los miembros de tu equipo de Supabase. La cuenta queda igualmente pendiente hasta que un admin la aprueba.
   - Longitud mínima de contraseña: **8**.
3. **Authentication → URL Configuration → Site URL**: pon la URL de Vercel cuando la tengas (p. ej. `https://troko.vercel.app`).

## 2. Ejecutar las migraciones

En Supabase → **SQL Editor** → *New query*, pega y ejecuta **en este orden**:

| Archivo | Qué hace |
|---|---|
| `supabase/migrations/0001_base.sql` | Perfiles, grupos, roles, aprobación, códigos de invitación, bucket de avatares y todas las políticas RLS |
| `supabase/migrations/0002_function_grants.sql` | Quita el acceso por la API a las funciones internas (triggers y comprobaciones de permisos) |
| `supabase/migrations/0003_announcements.sql` | Tablón de avisos (generales o por grupos, importantes, fijados) y control de leídos |
| `supabase/migrations/0004_announcements_author_idx.sql` | Índice de autoría de avisos |
| `supabase/migrations/0005_events.sql` | Calendario: eventos, repeticiones, asistencia, notas personales y suscripción .ics |
| `supabase/migrations/0006_wall.sql` | Muro de grupos: publicaciones, fotos (bucket privado), comentarios, reacciones y tiempo real |
| `supabase/migrations/0007_admin.sql` | Resumen de admin, restablecer contraseñas y borrar cuentas |
| `supabase/migrations/0008_instrument_names.sql` | Renombra los instrumentos guardados a Fondo 1, Fondo 2, Surdo 3, Repique, Caja y Timbau |
| `supabase/migrations/0009_group_requests.sql` | Solicitudes para entrar en grupos (las acepta o rechaza un admin) |
| `supabase/migrations/0010_disable_invite_codes.sql` | Desactiva los códigos de invitación: todo pasa por la aprobación de un admin |
| `supabase/migrations/0011_push.sql` | Notificaciones push (muro, aceptación en grupos, cuenta aprobada). Ver *Notificaciones* abajo |
| `supabase/migrations/0012_announcement_media.sql` | Fotos y enlaces en los avisos, y su notificación push |
| `supabase/migrations/0013_wall_admins_chat.sql` | El muro pasa a ser solo de admins (el resto reacciona) y cada grupo tiene un chat con fotos (bucket privado `chat`) |
| `supabase/seed.sql` | Los grupos actuales (Semilla, Brote, Raíz, Bloco, Timbau). Se puede repetir sin duplicar |

> Cada fase añadirá una migración nueva (`0002_…`, `0003_…`). Ejecuta solo las que aún no hayas ejecutado.

## 3. Variables de entorno

En Supabase → **Project Settings → API Keys** (o **Data API**) copia:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / publishable key** (la pública, **nunca** la `service_role` / `secret`) → `VITE_SUPABASE_ANON_KEY`

```bash
cp .env.example .env
# y rellena los dos valores
```

La clave `anon` es pública por diseño: la seguridad la ponen las políticas RLS de la base de datos, no el frontend.

## 4. Ejecutar en local

Requiere Node 20 o superior.

```bash
npm install
npm run dev          # http://localhost:5173
```

Para probar en tu móvil dentro de la misma wifi: `npm run dev -- --host` y abre la IP que aparece.

Otros comandos:

```bash
npm run build        # compila (comprueba tipos + genera la PWA en dist/)
npm run preview      # sirve dist/ para probar la PWA y el modo sin conexión
npm run test:db      # tests de seguridad de la base de datos (RLS) con PGlite
npm run icons        # regenera logos limpios e iconos a partir de logos/*.png
```

## 5. Crear el primer admin

1. Abre la app y **regístrate** con tu email.
2. En Supabase → SQL Editor, abre `supabase/make_admin.sql`, cambia el email por el tuyo y ejecútalo.
3. Recarga la app: tendrás la pestaña **Admin**, desde la que puedes aprobar al resto, asignar grupos y nombrar coordinadores/as u otros admins.

## 6. Desplegar en Vercel

1. Sube el proyecto a un repositorio de GitHub.
2. En [vercel.com](https://vercel.com) → **Add New → Project** → importa el repositorio. Detecta Vite automáticamente.
3. En **Environment Variables** añade `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
4. **Deploy**. Cada `git push` a `main` vuelve a desplegar, y quien tenga la app abierta verá el aviso *"Hay una actualización"*.
5. Copia la URL final en Supabase → Authentication → URL Configuration → Site URL.

`vercel.json` ya incluye:
- **Rewrites** para que el enrutado de la SPA funcione al recargar cualquier ruta.
- Cabeceras para que el service worker y el manifest nunca se queden en caché.
- Un **cron diario** (`/api/keepalive`) que hace una consulta mínima para que Supabase gratuito no pause el proyecto tras 7 días sin uso (p. ej. en agosto).

## 7. Cómo funcionan las cuentas

- **Registro**: nombre + email + contraseña. La cuenta queda **pendiente** hasta que un admin la aprueba y le asigna grupos. Mientras tanto la persona ve una pantalla de espera que se actualiza sola.
- **Sin códigos de invitación**: toda cuenta nueva la aprueba un admin, y para entrar en un grupo se pide acceso (ver abajo). Para invitar a alguien se comparte el enlace de registro (*Admin → Grupos → grupo* o, para la coordinación, *Muro → grupo → Miembros*). Los códigos de la fase 1 están desactivados en la base de datos (migración 0010).
- **Roles**:
  - **Admin**: gestiona todo.
  - **Coordinador/a**: por grupo. Publica avisos y eventos para sus grupos y modera su muro y su chat.
  - **Miembro**.
- **Contraseña olvidada**: mientras no haya un servidor de correo configurado, un admin la restablece en *Admin → Personas → persona → Restablecer contraseña*: la app genera una contraseña temporal (p. ej. `surdo-caixa-4821`) y un mensaje para copiar y enviar. Después la persona puede cambiarla en *Perfil → Cambiar contraseña*. (`supabase/reset_password.sql` sigue sirviendo si hiciera falta hacerlo desde Supabase.)
- **Borrar una cuenta**: cada persona puede borrar la suya en *Perfil → Borrar mi cuenta*, y un admin cualquiera desde su ficha. Se borran el perfil, sus publicaciones, fotos y comentarios del muro, sus mensajes y fotos del chat, su asistencia y sus notas; los avisos y eventos que creó se mantienen. La última cuenta admin no se puede borrar.
- **Resumen** (*Admin → Resumen*): personas, contenido y cuánto se ha usado del plan gratuito de Supabase (fotos y base de datos).
- **Orden de los grupos**: en *Admin → Grupos*, con las flechas ↑↓. Es el orden en que salen en toda la app; un grupo nuevo va al final.
- **Entrar en otros grupos**: en *Muro* cada persona ve todos los grupos. En los que no está puede pulsar **Solicitar acceso** (también desde dentro del grupo); un admin la acepta o rechaza en *Admin → Pendientes*. Mientras tanto no ve el muro de ese grupo. Si se rechaza, lo ve y puede volver a pedirlo.
- Los emails solo los ven los admins.

## 7b. Avisos

- **Fotos y enlaces**: como en el muro, hasta 6 fotos (bucket privado `announcements`: solo las ve quien puede ver el aviso) y un enlace de vídeo o música (YouTube, Instagram, TikTok, Spotify con reproductor). Las fotos se eligen al crear el aviso.

- **Quién publica**: un admin, para toda la batucada o para los grupos que elija; la coordinación, solo para los grupos que coordina.
- **Quién los ve**: los generales, todo el mundo; los de grupo, solo sus miembros (y los admins).
- **Importante** los destaca en amarillo; **Fijar arriba** los deja los primeros hasta que se desfijan.
- **No leídos**: la pestaña Avisos muestra cuántos avisos nuevos tienes (de los últimos 30 días). Al abrir el tablón se marcan como leídos, pero siguen señalados como *Nuevo* mientras no salgas de la pantalla.
- Quien escribió el aviso (y los admins) ve cuántas personas lo han visto, y puede editarlo, fijarlo o borrarlo.

## 7c. Calendario

- **Quién crea eventos**: igual que los avisos (admin para todo; coordinación para sus grupos). Editar, cancelar y borrar: un admin o quien coordine **todos** los grupos del evento.
- **Tipos**: clase, ensayo, bolo, festival, reunión, quedada u otro. Pueden durar *todo el día* y varios días (festivales).
- **Repeticiones**: cada semana, cada dos semanas o cada mes, hasta 60 fechas. Cada fecha es un evento propio: tiene su asistencia y se puede cancelar o cambiar sola. Al editar se elige *Solo este* o *Este y los siguientes* (si se cambia la hora, las siguientes se mueven igual).
- **Asistencia**: *Voy / Quizá / No voy*. Quien ve el evento ve quién va.
- **Mi nota**: nota privada por evento (solo la ve quien la escribe).
- **Calendario del móvil** (Perfil → *Calendario en el móvil*): suscripción `.ics` al Calendario de Apple o Google Calendar, servida por `api/ics.ts`. Usa un enlace secreto personal que se puede regenerar. Solo funciona desplegado en Vercel (en `npm run dev` no hay funciones de `api/`).

## 7d. Muro de grupos

- Cada grupo tiene su **muro** (pestaña *Muro* → grupo): lo ven solo sus miembros (y los admins). **Publican y comentan solo los admins**; el resto del grupo lo ve y reacciona. Lo publicado antes de este cambio se queda, y quien lo escribió aún puede editarlo o borrarlo.
- **Publicaciones**: texto, hasta 6 fotos y un enlace de vídeo o música (YouTube, Instagram, TikTok o Spotify; los vídeos no se suben). Los enlaces de Spotify se ven como reproductor dentro de la publicación. Quien publica puede editar el texto.
- **Fotos**: se reducen en el móvil (1600 px + miniatura de 640 px) y se guardan en el bucket **privado** `wall`: solo las ven las personas del grupo, mediante enlaces temporales. Pestaña **Galería** con todas las fotos del grupo.
- **Comentarios y reacciones** (👏 ❤️ 😂 🥁 🔥, una por persona).
- **Moderación**: la coordinación del grupo y los admins pueden borrar publicaciones y comentarios. Al borrar una publicación se borran también sus fotos.
- **Tiempo real**: lo nuevo aparece sin recargar mientras el grupo está abierto.
- **Chat** (pestaña *Chat* del grupo): escribe cualquier persona del grupo (y los admins). Texto con enlaces pulsables y hasta 6 fotos por mensaje, en el bucket **privado** `chat` (solo las ve el grupo; no salen en la Galería). Los mensajes no se editan; tocando un mensaje, quien lo escribió, la coordinación del grupo o un admin pueden borrarlo. Los mensajes del chat no envían notificaciones push.

## 7e. Notificaciones

- Cada persona las activa en su móvil en **Perfil → Notificaciones** (también hay una invitación en *Muro* y "Avísame cuando me acepten" en la pantalla de espera). En **iPhone** solo funcionan con la app **instalada en la pantalla de inicio** e iOS 16.4 o posterior.
- Llegan cuando: alguien publica en el muro de tu grupo, se publica un aviso para ti (general o de tu grupo), te aceptan o te añaden a un grupo y cuando aprueban tu cuenta. Quien publica no recibe su propio aviso.
- Funcionamiento: un trigger de la base de datos llama con `pg_net` a `api/push.ts` (Vercel), que pide a `push_prepare()` el mensaje y los destinatarios y los envía con Web Push. Las suscripciones caducadas se borran solas.
- **Configuración** (ya hecha en el proyecto): las claves VAPID, el secreto compartido y la URL de envío están **solo** en la tabla `private.app_config` de Supabase (no en el repositorio ni en Vercel). Para montarlo en otro proyecto: generar claves con `npx web-push generate-vapid-keys` y rellenar esa tabla como indica la cabecera de `0011_push.sql`. Las llamadas y sus respuestas se ven en `net._http_response`.
- Al cerrar sesión, ese móvil deja de recibir los avisos de esa cuenta.

## 8. Estructura

```
api/                  Funciones de Vercel: keepalive y calendario .ics
logos/                Logos originales
public/               Logos limpios e iconos de la PWA (generados con npm run icons)
scripts/              prepare-logos.mjs · make-pattern.py (fondo de franjas tribales)
supabase/
  migrations/         SQL por fases
  tests/              Tests de RLS con PGlite
  seed.sql            Datos iniciales
  make_admin.sql      Nombrar el primer admin
  reset_password.sql  Restablecer una contraseña
src/
  app/                Router, AppShell, barra inferior, guardas, aviso de actualización
  components/ui/      Botones, campos, tarjetas, estados vacío/carga/error, toasts…
  features/           auth · admin · groups · profile · install · announcements · calendar · wall
  lib/                Supabase, caché offline, compresión de imágenes, plataforma, tema
  types/database.ts   Tipos de la base de datos
  index.css           Tokens de marca (brand-black, brand-blue…) y temas oscuro/claro
```

**Colores de marca**: en `src/index.css`, bloque `@theme` (`--color-brand-black`, `--color-brand-blue`…). Cambiándolos ahí se aplican en toda la app.

## 9. Límites de los planes gratuitos (a tener en cuenta)

- **Supabase Free**:
  - 500 MB de base de datos, 1 GB de archivos y unos 5 GB/mes de transferencia.
  - Las fotos se comprimen en el móvil antes de subirse.
  - Los vídeos del muro se comparten como **enlaces** (YouTube, Instagram…).
- **Vercel Hobby**: sus condiciones hablan de uso "personal y no comercial". Si la escuela lo considera un problema, el proyecto se despliega igual en Netlify o Cloudflare Pages.
- **iPhone**:
  - Para instalar la app hay que usar Safari → Compartir → *Añadir a pantalla de inicio*.
  - La app instalada no comparte sesión con Safari: hay que iniciar sesión dentro de ella.
  - Las notificaciones push (fase futura) necesitan iOS 16.4 o superior y la app instalada.

## 10. Fases

- [x] **1. Base**: PWA, autenticación, registro con aprobación, roles, grupos, códigos de invitación, perfil, panel de admin y navegación.
- [x] **2. Avisos**: tablón por grupos, fijados, importantes, no leídos.
- [x] **3. Calendario y eventos**: categorías, recurrencias, asistencia, notas personales, .ics.
- [x] **4. Muro de grupos**: publicaciones, fotos, comentarios, reacciones, galería, tiempo real.
- [x] **5. Admin completo y pulido general**: resumen y uso del plan, contraseñas y borrado de cuentas desde la app, código de invitación para la coordinación, novedades del muro, próximo evento en Avisos, pantalla de error y carga diferida de pantallas.
- [x] **Notificaciones push** (muro, avisos, aceptación en grupos, cuenta aprobada).
- [x] **Muro solo de admins y chat de grupo**.
- [ ] **Más adelante**: encuestas, repositorio de material.
