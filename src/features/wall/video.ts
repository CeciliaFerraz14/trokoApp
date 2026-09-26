// Enlaces de vídeo y música del muro: los vídeos no se suben (1 GB gratis), se enlazan.

export type VideoLink =
  | { kind: 'youtube'; url: string; id: string }
  | { kind: 'spotify'; url: string; embed: string }
  | { kind: 'instagram' | 'tiktok' | 'link'; url: string; host: string }

// open.spotify.com/(intl-es/)track|album|playlist|episode|show|artist/<id>
const SPOTIFY = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[A-Za-z]{2})?\/)?(track|album|playlist|episode|show|artist)\/([A-Za-z0-9]{10,40})/

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
  const spotify = url.match(SPOTIFY)
  if (spotify) return { kind: 'spotify', url, embed: `https://open.spotify.com/embed/${spotify[1]}/${spotify[2]}` }
  const host = parsed.hostname.replace(/^www\./, '')
  if (host === 'instagram.com') return { kind: 'instagram', url, host }
  if (host.endsWith('tiktok.com')) return { kind: 'tiktok', url, host }
  return { kind: 'link', url, host }
}
