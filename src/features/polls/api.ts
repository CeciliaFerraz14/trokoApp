import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { WallAuthor } from '@/features/wall/api'
import type { Poll } from '@/types/database'

export interface PollVoteItem {
  option: number
  user_id: string
  voter: WallAuthor | null
}

export interface PollItem extends Poll {
  votes: PollVoteItem[]
}

/** Dónde va la encuesta: en un aviso o en un mensaje del chat */
export type PollParent = { announcementId: string } | { messageId: string }

const parentColumn = (p: PollParent) => ('announcementId' in p ? (['announcement_id', p.announcementId] as const) : (['message_id', p.messageId] as const))

const SELECT = '*, votes:poll_votes(option, user_id, voter:profiles!poll_votes_user_id_fkey(id, full_name, nickname, avatar_url))'

/** La encuesta de un aviso o de un mensaje (null si no tiene) */
export function usePoll(parent: PollParent) {
  const [column, id] = parentColumn(parent)
  return useQuery({
    queryKey: ['poll', column, id],
    queryFn: async () => {
      const { data, error } = await supabase.from('polls').select(SELECT).eq(column, id).maybeSingle()
      if (error) throw error
      return data as unknown as PollItem | null
    },
  })
}

/** Lo que se escribe al crear una encuesta */
export interface PollDraft {
  question: string
  options: string[]
  multiple: boolean
}

export const emptyPoll = (): PollDraft => ({ question: '', options: ['', ''], multiple: false })

/** Error del borrador (o null si se puede crear) */
export function pollDraftError(d: PollDraft) {
  if (!d.question.trim()) return 'Escribe la pregunta de la encuesta.'
  if (d.options.filter((o) => o.trim()).length < 2) return 'La encuesta necesita al menos dos respuestas.'
  return null
}

export async function createPoll(parent: PollParent, d: PollDraft) {
  const { error } = await supabase.from('polls').insert({
    ...('announcementId' in parent ? { announcement_id: parent.announcementId } : { message_id: parent.messageId }),
    question: d.question.trim(),
    options: d.options.map((o) => o.trim()).filter(Boolean),
    multiple: d.multiple,
  })
  if (error) throw error
}

/** Votar o quitar el voto de una respuesta */
export function useVote() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ poll, option, on }: { poll: Pick<Poll, 'id'>; option: number; on: boolean }) => {
      const { error } = on
        ? await supabase.from('poll_votes').insert({ poll_id: poll.id, option })
        : // La RLS solo deja borrar los votos propios
          await supabase.from('poll_votes').delete().eq('poll_id', poll.id).eq('option', option)
      if (error) throw error
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['poll'] }),
  })
}

/** Cerrar (o reabrir) una encuesta: su autor/a o un admin */
export function useClosePoll() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ poll, close }: { poll: Pick<Poll, 'id'>; close: boolean }) => {
      const { data, error } = await supabase.from('polls').update({ closed_at: close ? new Date().toISOString() : null }).eq('id', poll.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No puedes cerrar esta encuesta.')
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['poll'] }),
  })
}

/** Los votos de otras personas aparecen solos (un canal para toda la app) */
export function usePollsRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => {
      clearTimeout(timer)
      // Solo se recargan las encuestas que estén en pantalla
      timer = setTimeout(() => void qc.invalidateQueries({ queryKey: ['poll'] }), 300)
    }
    const channel = supabase
      .channel('polls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, refresh)
      .subscribe()
    return () => {
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [qc])
}
