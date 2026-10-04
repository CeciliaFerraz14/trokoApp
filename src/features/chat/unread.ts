// Mensajes del chat sin leer: los cuenta el servidor (leer en un móvil también
// cuenta en los demás) y se actualizan solos cuando llega un mensaje.
import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'

const KEY = ['chat-unread']

/** Mensajes sin leer por grupo ({ group_id: n }, solo los que tienen alguno) */
export function useChatUnread() {
  const { session } = useAuth()
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_chat_unread')
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.group_id, r.unread])) as Record<string, number>
    },
    enabled: !!session,
    refetchInterval: 2 * 60_000,
  })
}

/** Total de mensajes sin leer en todos mis grupos */
export function useChatUnreadTotal() {
  const { data } = useChatUnread()
  return Object.values(data ?? {}).reduce((sum, n) => sum + n, 0)
}

/** Vuelve a contar cuando llega un mensaje a cualquiera de mis chats */
export function useChatUnreadRealtime() {
  const { session } = useAuth()
  const qc = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    // Solo llegan los mensajes que la persona puede ver (los de sus grupos)
    const channel = supabase
      .channel('chat-unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        if ((payload.new as { author_id?: string }).author_id === userId) return
        clearTimeout(timer.current)
        timer.current = setTimeout(() => void qc.invalidateQueries({ queryKey: KEY }), 500)
      })
      .subscribe()
    return () => {
      clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])
}

/** Marca como leído el chat que se está viendo, también cuando llegan mensajes nuevos */
export function useMarkChatRead(groupId: string, newestId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!newestId) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      // Se quita ya de la cuenta; el servidor lo guarda para los demás dispositivos
      qc.setQueryData<Record<string, number>>(KEY, (prev) => {
        if (!prev?.[groupId]) return prev
        const { [groupId]: _, ...rest } = prev
        return rest
      })
      void supabase.rpc('mark_chat_read', { p_group: groupId }).then(({ error }) => {
        if (!error) void qc.invalidateQueries({ queryKey: KEY })
      })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [groupId, newestId, qc])
}
