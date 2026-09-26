import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { MessageSquareHeart, Pencil, SendHorizontal, Trash2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { formatWhen } from '@/lib/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { SectionTitle } from '@/components/ui/Card'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Linkify } from '@/components/ui/Linkify'
import { HeaderButton, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import { useAddComment, useComments, useDeleteComment, useDeletePost, usePost, useUpdatePost, useWallRealtime, type WallPost } from './api'
import { PostCard } from './PostCard'
import { parseVideo } from './video'

export function PostPage() {
  const { groupId, postId } = useParams()
  const { data: me } = useMe()
  const post = usePost(postId)
  const remove = useDeletePost()
  const navigate = useNavigate()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  useWallRealtime(groupId)

  const back = `/muro/${groupId}`
  if (post.isPending) return <><PageHeader title="Publicación" back={back} /><Spinner /></>
  if (post.isError) return <><PageHeader title="Publicación" back={back} /><ErrorState error={post.error} onRetry={() => post.refetch()} /></>
  const p = post.data
  if (!p) {
    return (
      <>
        <PageHeader title="Publicación" back={back} />
        <EmptyState icon={<MessageSquareHeart className="size-8" />} title="Publicación no encontrada">
          Puede que se haya borrado.
        </EmptyState>
      </>
    )
  }

  const isAuthor = p.author_id === me?.profile.id
  const canModerate = !!me?.canManageGroup(p.group_id)

  const onDelete = () => {
    if (!confirm('¿Borrar esta publicación? Se borrarán también sus fotos y comentarios.')) return
    remove.mutate(p, {
      onSuccess: () => {
        toast('Publicación borrada')
        navigate(back, { replace: true })
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  }

  return (
    <>
      <PageHeader
        title="Publicación"
        back={back}
        actions={
          <>
            {isAuthor && !editing && (
              <HeaderButton label="Editar publicación" onClick={() => setEditing(true)}>
                <Pencil className="size-5" />
              </HeaderButton>
            )}
            {(isAuthor || canModerate) && (
              <HeaderButton label="Borrar publicación" onClick={onDelete} disabled={remove.isPending}>
                <Trash2 className="size-5" />
              </HeaderButton>
            )}
          </>
        }
      />
      <Page className="space-y-5">
        {editing ? <EditPost post={p} onDone={() => setEditing(false)} /> : <PostCard post={p} detail />}
        <Comments post={p} canModerate={canModerate} />
      </Page>
    </>
  )
}

function EditPost({ post, onDone }: { post: WallPost; onDone: () => void }) {
  const update = useUpdatePost()
  const toast = useToast()
  const [body, setBody] = useState(post.body)
  const [videoUrl, setVideoUrl] = useState(post.video_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const video = parseVideo(videoUrl)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (videoUrl.trim() && !video) return setError('El enlace del vídeo tiene que empezar por https://')
    if (!body.trim() && !post.photos.length && !video) return setError('La publicación no puede quedarse vacía.')
    update.mutate(
      { post, body, videoUrl: video?.url ?? null },
      {
        onSuccess: () => {
          toast('Cambios guardados')
          onDone()
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-brand-blue/50 bg-surface p-4">
      <TextArea label="Texto" rows={5} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      <TextField label="Enlace de vídeo" type="url" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" />
      {post.photos.length > 0 && <p className="text-sm text-muted">Las fotos no se pueden cambiar: si hace falta, borra la publicación y vuelve a publicarla.</p>}
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" loading={update.isPending}>
          Guardar
        </Button>
      </div>
    </form>
  )
}

function Comments({ post, canModerate }: { post: WallPost; canModerate: boolean }) {
  const { data: me } = useMe()
  const comments = useComments(post.id)
  const add = useAddComment()
  const remove = useDeleteComment()
  const toast = useToast()
  const [body, setBody] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    add.mutate(
      { postId: post.id, groupId: post.group_id, body },
      { onSuccess: () => setBody(''), onError: (err) => toast(errorMessage(err), 'error') },
    )
  }

  return (
    <section>
      <SectionTitle>Comentarios</SectionTitle>
      {comments.isPending ? (
        <SkeletonList count={2} className="h-16" />
      ) : comments.isError ? (
        <ErrorState error={comments.error} onRetry={() => comments.refetch()} />
      ) : comments.data.length === 0 ? (
        <p className="px-1 pb-3 text-muted">Todavía no hay comentarios.</p>
      ) : (
        <ul className="mb-3 space-y-3">
          {comments.data.map((c) => {
            const canDelete = c.author_id === me?.profile.id || canModerate
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
                      confirm('¿Borrar este comentario?') &&
                      remove.mutate({ id: c.id, groupId: post.group_id }, { onError: (err) => toast(errorMessage(err), 'error') })
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
          label="Escribe un comentario"
          className="flex-1 [&_label]:sr-only"
          rows={1}
          maxLength={2000}
          placeholder="Escribe un comentario…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button type="submit" aria-label="Enviar comentario" loading={add.isPending} disabled={!body.trim()} className="size-11 shrink-0 px-0">
          {!add.isPending && <SendHorizontal className="size-5" />}
        </Button>
      </form>
    </section>
  )
}
