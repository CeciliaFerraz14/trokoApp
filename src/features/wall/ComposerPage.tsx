import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ImagePlus, UsersRound, X } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { useGroup } from '@/features/groups/api'
import { MAX_PHOTOS, useCreatePost } from './api'
import { VideoPreview } from './VideoPreview'
import { parseVideo } from './video'

export function ComposerPage() {
  const { groupId } = useParams()
  const { data: me } = useMe()
  const group = useGroup(groupId)
  const create = useCreatePost()
  const navigate = useNavigate()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)

  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Vistas previas locales de las fotos elegidas
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const video = parseVideo(videoUrl)
  const videoInvalid = !!videoUrl.trim() && !video
  const isMember = !!me && (me.isAdmin || me.memberships.some((m) => m.group.id === groupId))

  if (!isMember) {
    return (
      <>
        <PageHeader title="Nueva publicación" back />
        <EmptyState icon={<UsersRound className="size-8" />} title="No estás en este grupo">
          Solo las personas del grupo pueden publicar en su muro.
        </EmptyState>
      </>
    )
  }

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    const next = [...files, ...images].slice(0, MAX_PHOTOS)
    if (files.length + images.length > MAX_PHOTOS) toast(`Máximo ${MAX_PHOTOS} fotos por publicación`, 'error')
    setFiles(next)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (videoInvalid) return setError('El enlace del vídeo no es válido. Tiene que empezar por https://')
    if (!body.trim() && !files.length && !video) return setError('Escribe algo o añade una foto o un vídeo.')
    create.mutate(
      { groupId: groupId!, body, videoUrl: video?.url ?? null, files, onProgress: (done, total) => setProgress([done, total]) },
      {
        onSuccess: () => {
          toast('Publicado')
          navigate(`/muro/${groupId}`, { replace: true })
        },
        onError: (err) => setError(errorMessage(err)),
        onSettled: () => setProgress(null),
      },
    )
  }

  return (
    <>
      <PageHeader title="Nueva publicación" subtitle={group.data?.name} back />
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <TextArea
            label="¿Qué quieres contar?"
            rows={5}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="¡Qué ensayo más bueno el de hoy!"
          />

          <div className="space-y-2">
            <p className="text-sm font-semibold text-muted">
              Fotos ({files.length}/{MAX_PHOTOS})
            </p>
            {files.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {previews.map((url, i) => (
                  <li key={url} className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
                    <img src={url} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      aria-label={`Quitar foto ${i + 1}`}
                      onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 grid size-8 place-items-center rounded-full bg-black/70 text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            {files.length < MAX_PHOTOS && (
              <Button type="button" variant="secondary" block icon={<ImagePlus className="size-4" />} onClick={() => fileInput.current?.click()}>
                Añadir fotos
              </Button>
            )}
            <p className="text-sm text-muted">Se reducen antes de subirlas. Solo las ven las personas del grupo.</p>
          </div>

          <div className="space-y-2">
            <TextField
              label="Enlace de vídeo (opcional)"
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              error={videoInvalid ? 'Pega un enlace que empiece por https://' : null}
              hint="De YouTube, Instagram… Los vídeos no se suben a la app."
            />
            {video && <VideoPreview video={video} />}
          </div>

          <FormError>{error}</FormError>
          <Button type="submit" block loading={create.isPending}>
            {progress && progress[1] > 0 && progress[0] < progress[1] ? `Subiendo fotos ${progress[0] + 1}/${progress[1]}…` : 'Publicar'}
          </Button>
        </form>
      </Page>
    </>
  )
}
