import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Megaphone, Pin, TriangleAlert } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { AudiencePicker, canPublish, useAudienceField } from '@/features/groups/audience'
import { PhotoPicker } from '@/features/wall/PhotoPicker'
import { VideoPreview } from '@/features/wall/VideoPreview'
import { parseVideo } from '@/features/wall/video'
import { canEditAnnouncement, useAnnouncement, useSaveAnnouncement } from './api'

export function AnnouncementFormPage() {
  const { id } = useParams()
  const isNew = !id
  const { data: me } = useMe()
  const existing = useAnnouncement(id)
  const save = useSaveAnnouncement()
  const navigate = useNavigate()
  const toast = useToast()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [important, setImportant] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const audience = useAudienceField({ isNew })
  const [error, setError] = useState<string | null>(null)

  // Al editar: cargar el aviso una sola vez (placeholderData no cuenta)
  const loaded = existing.data && !existing.isPlaceholderData ? existing.data : null
  useEffect(() => {
    if (!loaded) return
    setTitle(loaded.title)
    setBody(loaded.body)
    setImportant(loaded.important)
    setPinned(loaded.pinned)
    setLinkUrl(loaded.link_url ?? '')
    audience.load(loaded.group_ids)
    // Solo al llegar el aviso: no pisar lo que se esté escribiendo si se recarga
  }, [loaded?.id])

  const header = <PageHeader title={isNew ? 'Nuevo aviso' : 'Editar aviso'} back />

  if (!isNew && (existing.isPending || existing.isPlaceholderData)) return <>{header}<Spinner /></>
  if (!isNew && existing.isError) return <>{header}<ErrorState error={existing.error} onRetry={() => existing.refetch()} /></>
  if (isNew ? !canPublish(me) : !existing.data || !canEditAnnouncement(me, existing.data)) {
    return (
      <>
        {header}
        <EmptyState icon={<Megaphone className="size-8" />} title="No puedes hacer esto">
          Solo los admins y la coordinación de cada grupo pueden publicar avisos.
        </EmptyState>
      </>
    )
  }

  const link = parseVideo(linkUrl)
  const linkInvalid = !!linkUrl.trim() && !link

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('El aviso necesita un título.')
    const group_ids = audience.value()
    if (!group_ids) return setError('Elige al menos un grupo.')
    if (linkInvalid) return setError('El enlace tiene que empezar por https://')

    save.mutate(
      {
        id,
        title: title.trim(),
        body: body.trim(),
        important,
        pinned,
        group_ids,
        link_url: link?.url ?? null,
        files: isNew ? files : [],
        onProgress: (done, total) => setProgress([done, total]),
      },
      {
        onSettled: () => setProgress(null),
        onSuccess: (a) => {
          toast(isNew ? 'Aviso publicado' : 'Cambios guardados')
          navigate(`/avisos/${a.id}`, { replace: true })
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <>
      {header}
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <TextField label="Título" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ensayo general el jueves" />
          <TextArea
            label="Texto"
            rows={6}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            hint="Opcional. Los enlaces se podrán pulsar."
          />

          {isNew ? (
            <PhotoPicker files={files} onChange={setFiles} note="Se reducen antes de subirlas. Solo las ve quien puede ver el aviso." />
          ) : (
            !!existing.data?.photos.length && (
              <p className="text-sm text-muted">Las fotos no se pueden cambiar: si hace falta, borra el aviso y vuelve a publicarlo.</p>
            )
          )}

          <div className="space-y-2">
            <TextField
              label="Enlace de vídeo o música (opcional)"
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/… o https://open.spotify.com/…"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              error={linkInvalid ? 'Pega un enlace que empiece por https://' : null}
              hint="De YouTube, Instagram, TikTok o Spotify."
            />
            {link && <VideoPreview video={link} />}
          </div>

          <AudiencePicker field={audience} noun="aviso" />

          <div className="space-y-2">
            <Switch
              label="Importante"
              hint="Se destaca en color para que nadie se lo pierda."
              icon={<TriangleAlert className="size-5" />}
              checked={important}
              onChange={setImportant}
            />
            <Switch
              label="Fijar arriba"
              hint="Se queda el primero hasta que lo desfijes."
              icon={<Pin className="size-5" />}
              checked={pinned}
              onChange={setPinned}
            />
          </div>

          <FormError>{error}</FormError>
          <Button type="submit" block loading={save.isPending}>
            {progress && progress[1] > 0 && progress[0] < progress[1]
              ? `Subiendo fotos ${progress[0] + 1}/${progress[1]}…`
              : isNew
                ? 'Publicar aviso'
                : 'Guardar cambios'}
          </Button>
        </form>
      </Page>
    </>
  )
}
