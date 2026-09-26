// Vercel Cron (1 vez al día): hace una consulta mínima a Supabase para que el
// proyecto gratuito no se pause por inactividad (se pausa tras 7 días).
export async function GET() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return new Response('Faltan variables de entorno', { status: 500 })

  const res = await fetch(`${url}/rest/v1/groups?select=id&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  return new Response(res.ok ? 'ok' : `error ${res.status}`, { status: res.ok ? 200 : 502 })
}
