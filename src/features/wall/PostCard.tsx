import { Link } from 'react-router'
import { MessageSquare } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatWhen } from '@/lib/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Linkify } from '@/components/ui/Linkify'
import { displayName } from '@/features/groups/api'
import type { WallPost } from './api'
import { PhotoGrid } from './PhotoGrid'
import { ReactionBar } from './ReactionBar'
import { VideoPreview } from './VideoPreview'
import { parseVideo } from './video'

/** Publicación del muro. En la lista el texto largo se recorta; en el detalle se ve entero */
export function PostCard({ post, detail = false }: { post: WallPost; detail?: boolean }) {
  const href = `/muro/${post.group_id}/p/${post.id}`
  const video = parseVideo(post.video_url)
  return (
    <article className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <header className="flex items-center gap-3">
        <Avatar name={post.author?.full_name ?? '?'} url={post.author?.avatar_url} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{post.author ? displayName(post.author) : 'Cuenta eliminada'}</p>
          <p className="text-sm text-muted">
            {detail ? (
              formatWhen(post.created_at)
            ) : (
              <Link to={href} className="hover:underline">
                {formatWhen(post.created_at)}
              </Link>
            )}
            {post.edited_at && ' · editado'}
          </p>
        </div>
      </header>
      {post.body && <Linkify text={post.body} className={cn(!detail && 'line-clamp-6')} />}
      <PhotoGrid photos={post.photos} />
      {video && <VideoPreview video={video} />}
      <footer className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <ReactionBar post={post} />
        {!detail && (
          <Link to={href} className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-sm font-semibold text-muted hover:text-fg">
            <MessageSquare className="size-4" aria-hidden />
            {post.commentCount ? `${post.commentCount} ${post.commentCount === 1 ? 'comentario' : 'comentarios'}` : 'Comentar'}
          </Link>
        )}
      </footer>
    </article>
  )
}
