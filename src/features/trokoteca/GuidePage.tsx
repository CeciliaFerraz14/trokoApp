import { useParams } from 'react-router'
import { BookOpen, ExternalLink, FileText, Pencil } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Linkify } from '@/components/ui/Linkify'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { VideoPreview } from '@/features/wall/VideoPreview'
import { parseVideo } from '@/features/wall/video'
import { useFileUrl, useLibraryItem } from './api'

/** Una guía completa: texto, enlace y PDF */
export function GuidePage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const item = useLibraryItem(id)
  const fileUrl = useFileUrl(item.data?.file_path)

  const back = '/trokoteca?tab=guias'
  if (item.isPending) return <><PageHeader title="Guía" back={back} /><Spinner /></>
  if (item.isError) return <><PageHeader title="Guía" back={back} /><ErrorState error={item.error} onRetry={() => item.refetch()} /></>
  const guide = item.data
  if (!guide) {
    return (
      <>
        <PageHeader title="Guía" back={back} />
        <EmptyState icon={<BookOpen className="size-8" />} title="No encontrada">
          Esta guía ya no existe.
        </EmptyState>
      </>
    )
  }
  const link = parseVideo(guide.link_url)

  return (
    <>
      <PageHeader
        title={guide.title}
        back={back}
        actions={
          me?.isAdmin && (
            <HeaderLink to={`/trokoteca/${guide.id}/editar`} label="Editar">
              <Pencil className="size-5" />
            </HeaderLink>
          )
        }
      />
      <Page className="space-y-4">
        <h2 className="text-2xl leading-tight font-bold">{guide.title}</h2>
        {guide.body && (
          <Card>
            <Linkify text={guide.body} className="block whitespace-pre-wrap" />
          </Card>
        )}
        {link && <VideoPreview video={link} />}
        {guide.file_path && (
          <a
            href={fileUrl.data}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!fileUrl.data}
            className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand-blue aria-disabled:pointer-events-none aria-disabled:opacity-60"
          >
            <FileText className="size-6 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Abrir PDF</span>
              <span className="block truncate text-sm text-muted">{fileUrl.isError ? 'No se pudo cargar el PDF' : guide.file_name}</span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted" />
          </a>
        )}
      </Page>
    </>
  )
}
