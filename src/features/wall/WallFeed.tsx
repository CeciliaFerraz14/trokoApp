import { Link } from 'react-router'
import { ImagePlus, MessageSquareHeart } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { useWall } from './api'
import { PostCard } from './PostCard'

export function WallFeed({ groupId }: { groupId: string }) {
  const { data: me } = useMe()
  const wall = useWall(groupId)
  const posts = wall.data?.pages.flat() ?? []
  const canPost = !!me && (me.isAdmin || me.memberships.some((m) => m.group.id === groupId))

  return (
    <div className="space-y-3">
      {canPost && (
        <Link
          to={`/muro/${groupId}/nueva`}
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand-blue"
        >
          <Avatar name={me?.profile.full_name} url={me?.profile.avatar_url} size="sm" />
          <span className="flex-1 text-muted">Comparte algo con el grupo…</span>
          <ImagePlus className="size-5 text-accent" aria-hidden />
        </Link>
      )}

      {wall.isPending ? (
        <SkeletonList count={3} className="h-48" />
      ) : wall.isError ? (
        <ErrorState error={wall.error} onRetry={() => wall.refetch()} />
      ) : !posts.length ? (
        <EmptyState icon={<MessageSquareHeart className="size-8" />} title="El muro está vacío">
          {canPost
            ? 'Sé la primera persona en compartir una foto, un vídeo o unas palabras con el grupo.'
            : 'Solo las personas del grupo ven y escriben en su muro.'}
        </EmptyState>
      ) : (
        <>
          <ul className="space-y-3">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} />
              </li>
            ))}
          </ul>
          {wall.hasNextPage && (
            <Button variant="secondary" block loading={wall.isFetchingNextPage} onClick={() => wall.fetchNextPage()}>
              Ver publicaciones anteriores
            </Button>
          )}
        </>
      )}
    </div>
  )
}
