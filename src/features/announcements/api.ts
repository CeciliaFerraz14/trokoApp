import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Announcement, Profile } from '@/types/database'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Me } from '@/features/auth/useMe'

/** Cuántos avisos se cargan (los fijados siempre entran: van primero) */
const LIMIT = 100
/** Los avisos más antiguos que esto nunca cuentan como no leídos */
const UNREAD_WINDOW_MS = 1000 * 60 * 60 * 24 * 30

const SELECT = '*, author:profiles!announcements_author_id_fkey(id, full_name, nickname, avatar_url), reads:announcement_reads(count)'

export type AnnouncementAuthor = Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'>

export interface AnnouncementItem extends Announcement {
  /** null si la cuenta ya no existe o no está activa */
  author: AnnouncementAuthor | null
  /** Personas que lo han leído (solo tiene sentido para autor/a y admins) */
  readCount: number
  /** Leído por mí (los propios cuentan como leídos) */
  read: boolean
  /** Cuenta para el globo de "no leídos" */
  unread: boolean
}

type Row = Announcement & { author: AnnouncementAuthor | null; reads: { count: number }[] }

function toItem(row: Row, userId: string, readIds: Set<string>): AnnouncementItem {
  const { reads, ...rest } = row
  const read = row.author_id === userId || readIds.has(row.id)
  return {
    ...rest,
    readCount: reads[0]?.count ?? 0,
    read,
    unread: !read && Date.now() - new Date(row.created_at).getTime() < UNREAD_WINDOW_MS,
  }
}

/** Avisos visibles para la persona (RLS filtra por sus grupos): fijados primero, luego los más nuevos */
export function useAnnouncements() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['announcements', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select(SELECT)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(LIMIT)
      if (error) throw error
      const rows = (data ?? []) as unknown as Row[]

      const readIds = new Set<string>()
      if (rows.length) {
        const { data: reads, error: e2 } = await supabase
          .from('announcement_reads')
          .select('announcement_id')
          .eq('user_id', userId!)
          .in('announcement_id', rows.map((r) => r.id))
        if (e2) throw e2
        for (const r of reads ?? []) readIds.add(r.announcement_id)
      }
      return rows.map((r) => toItem(r, userId!, readIds))
    },
    enabled: !!userId,
    // Para que el globo de la pestaña se actualice con la app abierta
    refetchInterval: 2 * 60_000,
  })
}

export function useUnreadCount() {
  const { data } = useAnnouncements()
  return data?.filter((a) => a.unread).length ?? 0
}

/** Un aviso. Usa la lista ya cargada como dato provisional para abrirlo al instante */
export function useAnnouncement(id: string | undefined) {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['announcement', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('announcements').select(SELECT).eq('id', id!).maybeSingle()
      if (error) throw error
      if (!data) return null
      const cached = qc.getQueryData<AnnouncementItem[]>(['announcements', userId])?.find((a) => a.id === id)
      return toItem(data as unknown as Row, userId!, new Set(cached?.read ? [id!] : []))
    },
    placeholderData: () => qc.getQueryData<AnnouncementItem[]>(['announcements', userId])?.find((a) => a.id === id),
    enabled: !!id && !!userId,
  })
}

// ---------------------------------------------------------------------------
// Permisos (la seguridad real está en RLS; esto decide qué botones se ven)
// ---------------------------------------------------------------------------

export function canEditAnnouncement(me: Me | undefined, a: Pick<Announcement, 'author_id'>) {
  return !!me && (me.isAdmin || a.author_id === me.profile.id)
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

function useInvalidateAnnouncements() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['announcements'] }),
      qc.invalidateQueries({ queryKey: ['announcement'] }),
    ])
}

export type AnnouncementInput = Pick<Announcement, 'title' | 'body' | 'group_ids' | 'important' | 'pinned'>

export function useSaveAnnouncement() {
  const invalidate = useInvalidateAnnouncements()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<AnnouncementInput> & { id?: string }) => {
      const { data, error } = id
        ? await supabase.from('announcements').update(input).eq('id', id).select('id').single()
        : await supabase
            .from('announcements')
            .insert({ ...input, title: input.title ?? '' })
            .select('id')
            .single()
      if (error) throw error
      return data
    },
    onSuccess: invalidate,
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  const invalidate = useInvalidateAnnouncements()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: ['announcement', id] })
      return invalidate()
    },
  })
}

/** Marca avisos como leídos. Actualiza la caché al momento para que baje el globo */
export function useMarkRead() {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  const key = ['announcements', userId]

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('announcement_reads')
        .upsert(
          ids.map((id) => ({ announcement_id: id, user_id: userId! })),
          { onConflict: 'announcement_id,user_id', ignoreDuplicates: true },
        )
      if (error) throw error
    },
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: key })
      const set = new Set(ids)
      qc.setQueryData<AnnouncementItem[]>(key, (list) =>
        list?.map((a) => (set.has(a.id) ? { ...a, read: true, unread: false } : a)),
      )
    },
    onError: () => qc.invalidateQueries({ queryKey: key }),
  })
}
