import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Megaphone, Pencil, Pin, PinOff, Trash2, TriangleAlert } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { formatFull } from '@/lib/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Linkify } from '@/components/ui/Linkify'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import { Audience, useGroupMap } from '@/features/groups/audience'
import { PhotoGrid } from '@/features/wall/PhotoGrid'
import { VideoPreview } from '@/features/wall/VideoPreview'
import { parseVideo } from '@/features/wall/video'
import { canEditAnnouncement, useAnnouncement, useDeleteAnnouncement, useMarkRead, useSaveAnnouncement } from './api'
import { BirthdayBanner } from './BirthdayBanner'
import { BirthdayComments } from './BirthdayComments'
import { ReadersList } from './ReadersList'
import { PollFor } from '@/features/polls/PollCard'

export function AnnouncementDetailPage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const query = useAnnouncement(id)
  const groupMap = useGroupMap()
  const markRead = useMarkRead()
  const save = useSaveAnnouncement()
  const remove = useDeleteAnnouncement()
  const navigate = useNavigate()
  const toast = useToast()

  const a = query.data
  const needsMark = !!a && !a.read
  useEffect(() => {
    if (needsMark && id) markRead.mutate([id])
    // markRead cambia en cada render; basta con reaccionar al aviso
  }, [needsMark, id])

  if (query.isPending) return <><PageHeader title="Aviso" back="/avisos" /><Spinner /></>
  if (query.isError) return <><PageHeader title="Aviso" back="/avisos" /><ErrorState error={query.error} onRetry={() => query.refetch()} /></>
  if (!a) {
    return (
      <>
        <PageHeader title="Aviso" back="/avisos" />
        <EmptyState icon={<Megaphone className="size-8" />} title="Aviso no encontrado">
          Puede que se haya borrado o que no vaya dirigido a tus grupos.
        </EmptyState>
      </>
    )
  }

  const canEdit = canEditAnnouncement(me, a)
  const link = parseVideo(a.link_url)

  const togglePin = () =>
    save.mutate(
      { id: a.id, pinned: !a.pinned },
      { onSuccess: () => toast(a.pinned ? 'Aviso desfijado' : 'Aviso fijado arriba'), onError: (e) => toast(errorMessage(e), 'error') },
    )
  const onDelete = () => {
    if (!confirm('¿Borrar este aviso? Desaparecerá para todo el mundo.')) return
    remove.mutate(a, {
      onSuccess: () => {
        toast('Aviso borrado')
        navigate('/avisos', { replace: true })
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  }

  return (
    <>
      <PageHeader
        title="Aviso"
        back="/avisos"
        actions={
          canEdit && (
            <HeaderLink to={`/avisos/${a.id}/editar`} label="Editar aviso">
              <Pencil className="size-5" />
            </HeaderLink>
          )
        }
      />
      <Page className="space-y-5">
        <article className="space-y-4">
          {(a.pinned || a.important) && (
            <div className="flex flex-wrap gap-1.5">
              {a.pinned && (
                <Badge>
                  <Pin className="size-3" aria-hidden /> Fijado
                </Badge>
              )}
              {a.important && (
                <Badge tone="warning">
                  <TriangleAlert className="size-3" aria-hidden /> Importante
                </Badge>
              )}
            </div>
          )}
          {a.birthday_of && <BirthdayBanner person={a.birthday} large />}
          <h2 className="font-display text-3xl leading-tight font-bold">{a.title}</h2>
          <div className="flex items-center gap-3">
            <Avatar name={a.author?.full_name ?? 'Troko Bloco'} url={a.author?.avatar_url} size="sm" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{a.author ? displayName(a.author) : 'Troko Bloco'}</p>
              <p className="text-muted first-letter:uppercase">
                {formatFull(a.created_at)}
                {a.edited_at && ' · editado'}
              </p>
            </div>
          </div>
          {a.body && <Linkify text={a.body} className="text-lg leading-relaxed" />}
          <PhotoGrid photos={a.photos} bucket="announcements" />
          {link && <VideoPreview video={link} />}
          <PollFor parent={{ announcementId: a.id }} />
          <Card className="text-sm text-muted">
            <p className="mb-1 font-semibold text-fg">Para</p>
            <Audience groupIds={a.group_ids} groups={groupMap} />
          </Card>
        </article>

        {/* Solo en las felicitaciones se puede comentar */}
        {a.birthday_of && <BirthdayComments announcementId={a.id} />}

        {canEdit && (
          <section className="space-y-3">
            <ReadersList announcement={a} />
            <Button
              variant="secondary"
              block
              loading={save.isPending}
              onClick={togglePin}
              icon={a.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            >
              {a.pinned ? 'Desfijar' : 'Fijar arriba'}
            </Button>
            <Button variant="danger" block loading={remove.isPending} onClick={onDelete} icon={<Trash2 className="size-4" />}>
              Borrar aviso
            </Button>
          </section>
        )}
      </Page>
    </>
  )
}
