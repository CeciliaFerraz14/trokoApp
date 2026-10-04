import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { FileText, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { VideoPreview } from '@/features/wall/VideoPreview'
import { parseVideo } from '@/features/wall/video'
import type { LibrarySection } from '@/types/database'
import { MAX_PDF_BYTES, useDeleteLibraryItem, useLibraryItem, useSaveLibraryItem } from './api'
import { SECTION_TAB } from './TrokotecaPage'

const NOUN: Record<LibrarySection, { new: string; edit: string; saved: string }> = {
  guide: { new: 'Nueva guía', edit: 'Editar guía', saved: 'Guía guardada' },
  music: { new: 'Añadir música', edit: 'Editar música', saved: 'Música guardada' },
  video: { new: 'Añadir vídeo', edit: 'Editar vídeo', saved: 'Vídeo guardado' },
}

/** Crear o editar una guía, canción o vídeo (solo admins) */
export function LibraryItemFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const { data: me } = useMe()
  const existing = useLibraryItem(id)
  const save = useSaveLibraryItem()
  const remove = useDeleteLibraryItem()
  const navigate = useNavigate()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const paramSection = params.get('seccion') as LibrarySection | null
  const section: LibrarySection = existing.data?.section ?? (paramSection && paramSection in NOUN ? paramSection : 'guide')
  const isGuide = section === 'guide'

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [removePdf, setRemovePdf] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loaded = existing.data && !existing.isPlaceholderData ? existing.data : null
  useEffect(() => {
    if (!loaded) return
    setTitle(loaded.title)
    setBody(loaded.body)
    setLinkUrl(loaded.link_url ?? '')
    // Solo al llegar: no pisar lo que se esté escribiendo si se recarga
  }, [loaded?.id])

  const header = <PageHeader title={isNew ? NOUN[section].new : NOUN[section].edit} back />
  if (!me) return <>{header}<Spinner /></>
  if (!me.isAdmin) {
    return (
      <>
        {header}
        <EmptyState icon={<ShieldCheck className="size-8" />} title="No puedes hacer esto">
          Solo los admins pueden añadir contenido a la Trokoteca.
        </EmptyState>
      </>
    )
  }
  if (!isNew && (existing.isPending || existing.isPlaceholderData)) return <>{header}<Spinner /></>
  if (!isNew && existing.isError) return <>{header}<ErrorState error={existing.error} onRetry={() => existing.refetch()} /></>
  if (!isNew && !existing.data) return <>{header}<EmptyState title="No encontrado">Ya no existe.</EmptyState></>

  const link = parseVideo(linkUrl)
  const linkInvalid = !!linkUrl.trim() && !link
  const currentPdf = !removePdf && !pdf ? existing.data?.file_name : null

  const pickPdf = (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return toast('Elige un archivo PDF', 'error')
    if (file.size > MAX_PDF_BYTES) return toast('El PDF no puede pasar de 10 MB', 'error')
    setPdf(file)
    setRemovePdf(false)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Ponle un título.')
    if (linkInvalid) return setError('El enlace tiene que empezar por https://')
    if (!isGuide && !link) return setError(section === 'music' ? 'Pega el enlace de la canción.' : 'Pega el enlace del vídeo.')
    save.mutate(
      { id, section, title: title.trim(), body: body.trim(), link_url: link?.url ?? null, pdf: isGuide ? pdf : null, removePdf: isGuide && removePdf },
      {
        onSuccess: (item) => {
          toast(NOUN[section].saved)
          navigate(item.section === 'guide' ? `/trokoteca/${item.id}` : `/trokoteca?tab=${SECTION_TAB[item.section]}`, { replace: true })
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  const onDelete = () => {
    if (!existing.data || !confirm(`¿Borrar «${existing.data.title}»? No se puede deshacer.`)) return
    remove.mutate(existing.data, {
      onSuccess: () => {
        toast('Borrado')
        navigate(`/trokoteca?tab=${SECTION_TAB[section]}`, { replace: true })
      },
      onError: (err) => toast(errorMessage(err), 'error'),
    })
  }

  return (
    <>
      {header}
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <TextField
            label="Título"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={isGuide ? 'Cómo cuidar tu instrumento' : section === 'music' ? 'Samba reggae: ritmo base' : 'Actuación en las fiestas 2026'}
          />
          <TextArea
            label={isGuide ? 'Texto' : 'Descripción (opcional)'}
            rows={isGuide ? 10 : 3}
            maxLength={20000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            hint="Los enlaces se podrán pulsar."
          />

          <div className="space-y-2">
            <TextField
              label={isGuide ? 'Enlace (opcional)' : section === 'music' ? 'Enlace de la canción' : 'Enlace del vídeo'}
              type="url"
              inputMode="url"
              placeholder={section === 'music' ? 'https://open.spotify.com/… o https://youtu.be/…' : 'https://youtu.be/…'}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              error={linkInvalid ? 'Pega un enlace que empiece por https://' : null}
              hint={isGuide ? undefined : 'De YouTube, Spotify, Instagram, TikTok… No se suben archivos.'}
            />
            {link && <VideoPreview video={link} />}
          </div>

          {isGuide && (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-muted">PDF (opcional)</p>
              {pdf || currentPdf ? (
                <div className="flex min-h-14 items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-2">
                  <FileText className="size-5 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 truncate">{pdf?.name ?? currentPdf}</span>
                  <button
                    type="button"
                    aria-label="Quitar PDF"
                    onClick={() => (pdf ? setPdf(null) : setRemovePdf(true))}
                    className="grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              ) : (
                <Button type="button" variant="secondary" block icon={<Upload className="size-4" />} onClick={() => fileRef.current?.click()}>
                  Adjuntar PDF
                </Button>
              )}
              <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { pickPdf(e.target.files?.[0]); e.target.value = '' }} />
              <p className="px-1 text-sm text-muted">Máximo 10 MB. Solo lo pueden abrir las cuentas de Troko Bloco.</p>
            </div>
          )}

          <FormError>{error}</FormError>
          <Button type="submit" block loading={save.isPending}>
            {isNew ? 'Publicar' : 'Guardar cambios'}
          </Button>
          {!isNew && (
            <Button type="button" variant="danger" block icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={onDelete}>
              Borrar
            </Button>
          )}
        </form>
      </Page>
    </>
  )
}
