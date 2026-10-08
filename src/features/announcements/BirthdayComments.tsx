import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { SendHorizontal, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/dates'
import type { AnnouncementComment } from '@/types/database'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { SectionTitle } from '@/components/ui/Card'
import { TextArea } from '@/components/ui/Field'
import { Linkify } from '@/components/ui/Linkify'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import type { AnnouncementAuthor } from './api'

interface Comment extends AnnouncementComment {
  author: AnnouncementAuthor | null
}

const key = (announcementId: string) => ['announcement-comments', announcementId]

function useComments(announcementId: string) {
  return useQuery({
    queryKey: key(announcementId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcement_comments')
        .select('*, author:profiles!announcement_comments_author_id_fkey(id, full_name, nickname, avatar_url)')
        .eq('announcement_id', announcementId)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as Comment[]
    },
  })
}

/** Los comentarios de otras personas aparecen solos */
function useCommentsRealtime(announcementId: string) {
  const qc = useQueryClient()
  useEffect(() => {
    const refresh = () => void qc.invalidateQueries({ queryKey: key(announcementId) })
    const shown = () => new Set((qc.getQueryData<Comment[]>(key(announcementId)) ?? []).map((c) => c.id))
    const channel = supabase
      .channel(`announcement-comments-${announcementId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcement_comments', filter: `announcement_id=eq.${announcementId}` }, refresh)
      // Los DELETE de Realtime ignoran el filtro (solo traen el id)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'announcement_comments' }, ({ old }) => {
        if (shown().has((old as { id?: string }).id ?? '')) refresh()
      })
      .subscribe()
    return () => void supabase.removeChannel(channel)
  }, [announcementId, qc])
}

/** Felicitaciones: comentarios en los avisos de cumpleaños (en el resto de avisos no se comenta) */
export function BirthdayComments({ announcementId }: { announcementId: string }) {
  const { data: me } = useMe()
  const comments = useComments(announcementId)
  useCommentsRealtime(announcementId)
  const qc = useQueryClient()
  const toast = useToast()
  const [body, setBody] = useState('')

  // También la lista de Avisos, que enseña cuántas felicitaciones hay
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: key(announcementId) })
    void qc.invalidateQueries({ queryKey: ['announcements'] })
  }
  const add = useMutation({
    mutationFn: async (text: string) => {
      const { error } = await supabase.from('announcement_comments').insert({ announcement_id: announcementId, body: text.trim() })
      if (error) throw error
    },
    onSuccess: refresh,
  })
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('announcement_comments').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para borrar este comentario.')
    },
    onSuccess: refresh,
  })

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    add.mutate(body, { onSuccess: () => setBody(''), onError: (err) => toast(errorMessage(err), 'error') })
  }

  return (
    <section>
      <SectionTitle>Felicitaciones</SectionTitle>
      {comments.isPending ? (
        <SkeletonList count={2} className="h-16" />
      ) : comments.isError ? (
        <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
      ) : comments.data.length === 0 ? (
        <p className="px-1 pb-3 text-muted">Sé la primera persona en felicitar 🎉</p>
      ) : (
        <ul className="mb-3 space-y-3">
          {comments.data.map((c) => {
            const canDelete = c.author_id === me?.profile.id || !!me?.isAdmin
            return (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.author?.full_name ?? '?'} url={c.author?.avatar_url} size="sm" />
                <div className="min-w-0 flex-1 rounded-2xl bg-surface-2 px-3 py-2">
                  <p className="text-sm">
                    <span className="font-semibold">{c.author ? displayName(c.author) : 'Cuenta eliminada'}</span>
                    <span className="text-muted"> · {formatWhen(c.created_at)}</span>
                  </p>
                  <Linkify text={c.body} />
                </div>
                {canDelete && (
                  <IconButton
                    label="Borrar comentario"
                    className="text-muted"
                    onClick={() =>
                      confirm('¿Borrar este comentario?') && remove.mutate(c.id, { onError: (err) => toast(errorMessage(err), 'error') })
                    }
                  >
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <form onSubmit={onSubmit} className="flex items-end gap-2">
        <TextArea
          label="Escribe una felicitación"
          className="flex-1 [&_label]:sr-only"
          rows={1}
          maxLength={2000}
          placeholder="¡Felicidades! 🎂"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" aria-label="Enviar felicitación" loading={add.isPending} disabled={!body.trim()} className="size-11 shrink-0 px-0!">
          {!add.isPending && <SendHorizontal className="size-5" />}
        </Button>
      </form>
    </section>
  )
}
