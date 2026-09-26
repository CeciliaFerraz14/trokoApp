// Calendario .ics de una persona: GET /api/ics?token=…[&event=…]
// El calendario del móvil no tiene sesión, así que se identifica con el token
// secreto de calendar_tokens. La función calendar_feed (security definer)
// devuelve solo los eventos que esa persona puede ver.
import { buildIcs, type FeedEvent } from './_ics'

export async function GET(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !key) return new Response('Faltan variables de entorno', { status: 500 })

  const url = new URL(request.url)
  const token = url.searchParams.get('token') ?? ''
  const eventId = url.searchParams.get('event')
  if (token.length < 32 || (eventId && !/^[0-9a-f-]{36}$/i.test(eventId))) {
    return new Response('Enlace no válido', { status: 400 })
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/calendar_feed`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: token, p_event: eventId }),
  })
  if (!res.ok) return new Response('No se pudo cargar el calendario', { status: 502 })
  const events = (await res.json()) as FeedEvent[]
  if (eventId && !events.length) return new Response('Evento no encontrado', { status: 404 })

  const ics = buildIcs(events, { origin: url.origin })
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      // Un solo evento se descarga para añadirlo; el feed completo se sirve para suscribirse
      'Content-Disposition': `${eventId ? 'attachment' : 'inline'}; filename="${eventId ? 'evento' : 'troko-bloco'}.ics"`,
      'Cache-Control': 'private, max-age=300',
    },
  })
}
