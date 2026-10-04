import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { UsersRound } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { useGroup } from '@/features/groups/api'
import { useCreatePost } from './api'
import { PhotoPicker } from './PhotoPicker'
import { VideoPreview } from './VideoPreview'
import { parseVideo } from './video'

export function ComposerPage() {
  const { groupId } = useParams()
  const { data: me } = useMe()
  const group = useGroup(groupId)
  const create = useCreatePost()
  const navigate = useNavigate()
  const toast = useToast()

  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)


  const video = parseVideo(videoUrl)
  const videoInvalid = !!videoUrl.trim() && !video

  if (!me?.isAdmin) {
    return (
      <>
        <PageHeader title="Nueva publicación" back />
        <EmptyState icon={<UsersRound className="size-8" />} title="Solo para admins">
          En el muro publican los admins. Para compartir algo con el grupo, usa el chat.
        </EmptyState>
      </>
    )
  }


  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (videoInvalid) return setError('El enlace no es válido. Tiene que empezar por https://')
    if (!body.trim() && !files.length && !video) return setError('Escribe algo o añade una foto o un enlace.')
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

          <PhotoPicker files={files} onChange={setFiles} note="Se reducen antes de subirlas. Solo las ven las personas del grupo." />

          <div className="space-y-2">
            <TextField
              label="Enlace de vídeo o música (opcional)"
              type="url"
              inputMode="url"
              placeholder="https://youtu.be/… o https://open.spotify.com/…"
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              error={videoInvalid ? 'Pega un enlace que empiece por https://' : null}
              hint="De YouTube, Instagram, TikTok o Spotify. Los vídeos no se suben a la app, se enlazan."
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
