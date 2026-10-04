// Generador de iCalendar (RFC 5545) para /api/ics. Los archivos de api/ que
// empiezan por _ no son funciones de Vercel.

export interface FeedEvent {
  id: string
  title: string
  description: string
  category: string
  location: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  cancelled: boolean
  updated_at: string
  group_names: string[]
}

export const TIMEZONE = 'Europe/Madrid'

const CATEGORY_LABELS: Record<string, string> = {
  class: 'Clase',
  no_class: 'No hay clase',
  event: 'Evento',
  workshop: 'Talleres especiales',
  gig: 'Bolo',
  festival: 'Festival',
  social: 'Quedada',
  other: 'Otro',
}

/** 20261003T170000Z */
function utc(iso: string) {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Fecha en Madrid como 20261003 (para eventos de todo el día) */
function localDate(iso: string, plusDays = 0) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date(iso))
    .split('-')
    .map(Number)
  return new Date(Date.UTC(y, m - 1, d + plusDays)).toISOString().slice(0, 10).replace(/-/g, '')
}

function escape(text: string) {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Las líneas no pueden pasar de 75 bytes: se parten con CRLF + espacio */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line)
  if (bytes.length <= 75) return line
  const out: string[] = []
  let current = ''
  let size = 0
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length
    if (size + n > (out.length ? 74 : 75)) {
      out.push(current)
      current = ''
      size = 0
    }
    current += ch
    size += n
  }
  out.push(current)
  return out.join('\r\n ')
}

export function buildIcs(events: FeedEvent[], { origin, name = 'Troko Bloco' }: { origin: string; name?: string }) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Troko Bloco//App//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escape(name)}`,
    `X-WR-TIMEZONE:${TIMEZONE}`,
    // Cada cuánto deben refrescar los calendarios que lo respeten (Apple sí, Google va a su ritmo)
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]

  for (const e of events) {
    const details = [
      e.description,
      `${CATEGORY_LABELS[e.category] ?? ''} · Para: ${e.group_names.length ? e.group_names.join(', ') : 'toda la batucada'}`,
      `${origin}/calendario/${e.id}`,
    ].filter(Boolean)

    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@troko-bloco`,
      `DTSTAMP:${utc(e.updated_at)}`,
      `LAST-MODIFIED:${utc(e.updated_at)}`,
      // Cada cambio sube la secuencia para que el calendario sustituya la versión vieja
      `SEQUENCE:${Math.floor(new Date(e.updated_at).getTime() / 1000)}`,
    )
    if (e.all_day) {
      // DTEND es exclusivo: el día siguiente al último
      lines.push(`DTSTART;VALUE=DATE:${localDate(e.starts_at)}`, `DTEND;VALUE=DATE:${localDate(e.ends_at ?? e.starts_at, 1)}`)
    } else {
      lines.push(`DTSTART:${utc(e.starts_at)}`)
      if (e.ends_at) lines.push(`DTEND:${utc(e.ends_at)}`)
    }
    lines.push(
      `SUMMARY:${escape(e.cancelled ? `CANCELADO: ${e.title}` : e.title)}`,
      `STATUS:${e.cancelled ? 'CANCELLED' : 'CONFIRMED'}`,
      `DESCRIPTION:${escape(details.join('\n\n'))}`,
      `URL:${origin}/calendario/${e.id}`,
    )
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`)
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
