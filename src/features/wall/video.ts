// Enlaces de vídeo del muro: los vídeos no se suben (1 GB gratis), se enlazan.

export type VideoLink =
  | { kind: 'youtube'; url: string; id: string }
  | { kind: 'instagram' | 'tiktok' | 'link'; url: string; host: string }

const YOUTUBE = [
  /^https:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})/,
  /^https:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|live|embed)\/([\w-]{11})/,
  /^https:\/\/youtu\.be\/([\w-]{11})/,
]

/** null si no es un enlace https válido */
export function parseVideo(raw: string | null | undefined): VideoLink | null {
  const url = raw?.trim()
  if (!url) return null
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  for (const re of YOUTUBE) {
    const m = url.match(re)
    if (m) return { kind: 'youtube', url, id: m[1] }
  }
  const host = parsed.hostname.replace(/^www\./, '')
  if (host === 'instagram.com') return { kind: 'instagram', url, host }
  if (host.endsWith('tiktok.com')) return { kind: 'tiktok', url, host }
  return { kind: 'link', url, host }
}
