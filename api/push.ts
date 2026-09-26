// Envía notificaciones push: POST /api/push {kind, id1, id2}
// La llama la base de datos (pg_net) al publicar en un muro, al entrar en un
// grupo o al aprobarse una cuenta. Con el secreto compartido pide a
// push_prepare() el mensaje, las suscripciones y las claves VAPID; después
// envía con web-push y olvida las suscripciones caducadas.
import webpush from 'web-push'

interface Prepared {
  title: string
  body: string
  url: string
  tag: string
  vapid: { public: string; private: string; subject: string }
  subscriptions: { endpoint: string; p256dh: string; auth: string }[]
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(request: Request) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!supabaseUrl || !key) return new Response('Faltan variables de entorno', { status: 500 })

  const secret = request.headers.get('x-troko-secret')
  const { kind, id1, id2 } = (await request.json().catch(() => ({}))) as { kind?: string; id1?: string; id2?: string }
  if (!secret || !kind || !id1) return new Response('Petición no válida', { status: 400 })

  // Publicaciones y avisos con fotos se guardan en dos pasos (texto y fotos):
  // se espera un momento para que la notificación diga "ha compartido 2 fotos"
  if (kind === 'post' || kind === 'announcement') await sleep(1500)

  const rpc = (fn: string, args: object) =>
    fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })

  const res = await rpc('push_prepare', { p_secret: secret, p_kind: kind, p_id1: id1, p_id2: id2 ?? null })
  if (!res.ok) return new Response('No autorizado', { status: 401 })
  const msg = (await res.json()) as Prepared | null
  if (!msg || !msg.subscriptions.length) return Response.json({ sent: 0 })

  webpush.setVapidDetails(msg.vapid.subject, msg.vapid.public, msg.vapid.private)
  const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url, tag: msg.tag })
  const gone: string[] = []
  let sent = 0
  await Promise.all(
    msg.subscriptions.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
        sent++
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode
        // El dispositivo se dio de baja o la suscripción caducó
        if (status === 404 || status === 410) gone.push(s.endpoint)
      }
    }),
  )
  if (gone.length) await rpc('push_forget', { p_secret: secret, p_endpoints: gone })
  return Response.json({ sent, gone: gone.length })
}
