import { Link } from 'react-router'
import { BookOpen, ChevronRight, FileText, Music, Pencil, Video } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Linkify } from '@/components/ui/Linkify'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { VideoPreview } from '@/features/wall/VideoPreview'
import { parseVideo } from '@/features/wall/video'
import { useLibrary } from './api'

const adminHint = 'Pulsa + arriba para añadir.'

/** Guías: tarjetas que abren la guía completa */
export function GuideList({ isAdmin }: { isAdmin: boolean }) {
  const items = useLibrary('guide')
  if (items.isPending) return <SkeletonList count={4} />
  if (items.isError) return <ErrorState error={items.error} onRetry={() => items.refetch()} />
  if (!items.data.length) {
    return (
      <EmptyState icon={<BookOpen className="size-8" />} title="Todavía no hay guías">
        {isAdmin ? adminHint : 'Aquí estarán las guías e información de Troko Bloco.'}
      </EmptyState>
    )
  }
  return (
    <ul className="space-y-3">
      {items.data.map((g) => (
        <li key={g.id}>
          <Link to={`/trokoteca/${g.id}`} className="block">
            <Card className="flex items-center gap-3 hover:border-brand-blue">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-blue/15 text-accent">
                <BookOpen className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{g.title}</p>
                {g.body && <p className="line-clamp-2 text-sm text-muted">{g.body}</p>}
                {g.file_path && (
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-accent">
                    <FileText className="size-3.5" /> PDF
                  </p>
                )}
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Música y vídeos: tarjetas con el reproductor o la miniatura del enlace */
export function MediaList({ section, isAdmin }: { section: 'music' | 'video'; isAdmin: boolean }) {
  const items = useLibrary(section)
  if (items.isPending) return <SkeletonList count={3} className="h-40" />
  if (items.isError) return <ErrorState error={items.error} onRetry={() => items.refetch()} />
  if (!items.data.length) {
    const Icon = section === 'music' ? Music : Video
    return (
      <EmptyState icon={<Icon className="size-8" />} title={section === 'music' ? 'Todavía no hay música' : 'Todavía no hay vídeos'}>
        {isAdmin ? adminHint : section === 'music' ? 'Aquí estarán las canciones y ritmos para practicar.' : 'Aquí estarán los vídeos de Troko Bloco.'}
      </EmptyState>
    )
  }
  return (
    <ul className="space-y-3">
      {items.data.map((item) => {
        const link = parseVideo(item.link_url)
        return (
          <li key={item.id}>
            <Card className="space-y-3">
              <div className="flex items-start gap-2">
                <h3 className="min-w-0 flex-1 text-lg leading-snug font-semibold">{item.title}</h3>
                {isAdmin && (
                  <Link
                    to={`/trokoteca/${item.id}/editar`}
                    aria-label="Editar"
                    title="Editar"
                    className="-mt-1 -mr-1 grid size-10 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2"
                  >
                    <Pencil className="size-4" />
                  </Link>
                )}
              </div>
              {item.body && <Linkify text={item.body} className="block text-sm whitespace-pre-wrap text-muted" />}
              {link && <VideoPreview video={link} />}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
