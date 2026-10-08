import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { removePhotoFiles, signPhotoSets, uploadPhotos, type SignedPhoto } from '@/lib/photos'
import type { WallAuthor } from '@/features/wall/api'
import { createPoll, type PollDraft } from '@/features/polls/api'
import type { ChatMessage, ReactionEmoji } from '@/types/database'

const PAGE = 30
const BUCKET = 'chat'

export interface ChatItem extends ChatMessage {
  author: WallAuthor | null
  photos: SignedPhoto[]
  reactions: { emoji: ReactionEmoji; user_id: string }[]
  /** Lleva encuesta (se carga aparte con usePoll) */
  hasPoll: boolean
}

const MESSAGE_SELECT =
  '*, author:profiles!chat_messages_author_id_fkey(id, full_name, nickname, avatar_url), photos:chat_photos(id, path, width, height, position), ' +
  'reactions:chat_reactions(emoji, user_id), polls(id)'

type MessageRow = ChatMessage & {
  author: WallAuthor | null
  photos: Omit<SignedPhoto, 'url' | 'thumbUrl'>[]
  reactions: ChatItem['reactions']
  polls: { id: string }[] | { id: string } | null
}

/** Mensajes del chat del grupo por páginas: cada página, del más nuevo al más antiguo */
export function useChat(groupId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['chat', groupId],
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('chat_messages').select(MESSAGE_SELECT).eq('group_id', groupId!).order('created_at', { ascending: false }).limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      const rows = (data ?? []) as unknown as MessageRow[]
      const signed = await signPhotoSets(BUCKET, rows.map((r) => r.photos))
      return rows.map(({ polls, ...r }, i): ChatItem => ({
        ...r,
        photos: signed[i],
        // Una encuesta por mensaje: según la versión, PostgREST la da como objeto o como lista
        hasPoll: Array.isArray(polls) ? polls.length > 0 : !!polls,
      }))
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : null),
    enabled: !!groupId,
  })
}

/** Mensajes nuevos (y borrados) aparecen solos */
export function useChatRealtime(groupId: string | undefined) {
  const qc = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!groupId) return
    // Agrupa ráfagas (un mensaje con fotos son varios eventos)
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: ['chat', groupId] }), 300)
    }
    const channel = supabase.channel(`chat:${groupId}`)
    for (const table of ['chat_messages', 'chat_photos']) {
      channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `group_id=eq.${groupId}` }, refresh)
    }
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_reactions', filter: `group_id=eq.${groupId}` }, refresh)
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_reactions', filter: `group_id=eq.${groupId}` }, refresh)
    // Una reacción quitada solo trae su clave (mensaje y persona)
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_reactions' }, (payload) => {
      const id = (payload.old as { message_id?: string }).message_id
      const pages = qc.getQueryData<InfiniteData<ChatItem[]>>(['chat', groupId])?.pages
      if (id && pages?.some((page) => page.some((m) => m.id === id))) refresh()
    })
    // Los borrados no se pueden filtrar (solo traen el id): se refresca si el
    // mensaje borrado está en pantalla
    channel.on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' }, (payload) => {
      const id = (payload.old as { id?: string }).id
      const pages = qc.getQueryData<InfiniteData<ChatItem[]>>(['chat', groupId])?.pages
      if (id && pages?.some((page) => page.some((m) => m.id === id))) refresh()
    })
    channel.subscribe()
    return () => {
      clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [groupId, qc])
}

/**
 * Envía un mensaje: sube las fotos (grande + miniatura), crea el mensaje y
 * registra las fotos. Si algo falla, se deshace lo subido.
 */
export function useSendMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      groupId,
      body,
      files,
      mentions = [],
      poll,
      onProgress,
    }: {
      groupId: string
      body: string
      files: File[]
      /** Personas mencionadas con @ (reciben su propia notificación) */
      mentions?: string[]
      /** Encuesta del mensaje (un mensaje con encuesta no lleva texto ni fotos) */
      poll?: PollDraft
      onProgress?: (done: number, total: number) => void
    }) => {
      const messageId = crypto.randomUUID()
      const { photos, uploaded } = await uploadPhotos(BUCKET, `${groupId}/${messageId}`, files, onProgress)
      let created = false
      try {
        const { error } = await supabase.from('chat_messages').insert({ id: messageId, group_id: groupId, body: body.trim(), mentions })
        if (error) throw error
        created = true
        if (poll) await createPoll({ messageId }, poll)
        if (photos.length) {
          const { error: e2 } = await supabase.from('chat_photos').insert(photos.map((p) => ({ ...p, message_id: messageId })))
          if (e2) throw e2
        }
      } catch (err) {
        if (created) await supabase.from('chat_messages').delete().eq('id', messageId)
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
        throw err
      }
    },
    onSuccess: (_d, { groupId }) => void qc.invalidateQueries({ queryKey: ['chat', groupId] }),
  })
}

/** Borra el mensaje y sus fotos (las filas de fotos van en cascada) */
export function useDeleteMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (message: Pick<ChatItem, 'id' | 'group_id' | 'photos'>) => {
      const { data, error } = await supabase.from('chat_messages').delete().eq('id', message.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para borrar este mensaje.')
      // Si fallara, quedan archivos sin mensaje pero nadie puede llegar a ellos
      await removePhotoFiles(BUCKET, message.photos)
    },
    onSuccess: (_d, { group_id }) => void qc.invalidateQueries({ queryKey: ['chat', group_id] }),
  })
}

/** Mi reacción a un mensaje: emoji = null → quitarla */
export function useChatReact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ messageId, emoji }: { messageId: string; groupId: string; emoji: ReactionEmoji | null }) => {
      const { error } = emoji
        ? await supabase.from('chat_reactions').upsert({ message_id: messageId, emoji }, { onConflict: 'message_id,user_id' })
        : // La RLS solo deja quitar la propia
          await supabase.from('chat_reactions').delete().eq('message_id', messageId)
      if (error) throw error
    },
    onSettled: (_d, _e, { groupId }) => void qc.invalidateQueries({ queryKey: ['chat', groupId] }),
  })
}
