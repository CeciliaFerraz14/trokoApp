// "Novedades" del muro: publicaciones de otras personas posteriores a la
// última vez que se abrió el muro de cada grupo (se recuerda en este móvil).
import { useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useMe } from '@/features/auth/useMe'

const KEY = 'troko-wall-seen'
const WINDOW_MS = 1000 * 60 * 60 * 24 * 30

type Seen = Record<string, string>

function read(): Seen {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Seen
  } catch {
    return {}
  }
}

let seen = read()
const listeners = new Set<() => void>()

/**
 * Marca el muro del grupo como visto hasta `at` (la fecha de la publicación más
 * nueva, que viene del servidor: así no depende del reloj del móvil).
 */
export function markWallSeen(groupId: string, at: string) {
  if (seen[groupId] && seen[groupId] >= at) return
  seen = { ...seen, [groupId]: at }
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {
    /* sin almacenamiento: solo dura esta sesión */
  }
  listeners.forEach((l) => l())
}

function useSeen() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => seen,
  )
}

/** Grupos (de los míos) con publicaciones nuevas de otras personas */
export function useWallNews() {
  const { data: me } = useMe()
  const groupIds = me?.memberships.map((m) => m.group.id) ?? []
  const userId = me?.profile.id
  const latest = useQuery({
    queryKey: ['wall-news', userId, groupIds.join()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('group_id, created_at')
        .in('group_id', groupIds)
        .neq('author_id', userId!)
        .gte('created_at', new Date(Date.now() - WINDOW_MS).toISOString())
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      // La más reciente de cada grupo
      const map = new Map<string, string>()
      for (const p of data ?? []) if (!map.has(p.group_id)) map.set(p.group_id, p.created_at)
      return Object.fromEntries(map) as Record<string, string>
    },
    enabled: !!userId && groupIds.length > 0,
    refetchInterval: 2 * 60_000,
  })
  const seenMap = useSeen()
  // Si nunca se abrió el muro de un grupo, cuenta desde que se aprobó la cuenta
  const since = (g: string) => seenMap[g] ?? me?.profile.approved_at ?? me?.profile.created_at ?? ''
  const withNews = new Set(Object.entries(latest.data ?? {}).filter(([g, at]) => at > since(g)).map(([g]) => g))
  return withNews
}
