import { useEffect } from 'react'
import { Link } from 'react-router'
import { Clapperboard, ImagePlus, Lock, MessageSquareHeart, Music } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { JoinRequestButton } from '@/features/groups/JoinRequestButton'
import { useWall } from './api'
import { markWallSeen } from './news'
import { PostCard } from './PostCard'

export function WallFeed({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { data: me } = useMe()
  const wall = useWall(groupId)
  const posts = wall.data?.pages.flat() ?? []
  const isMember = !!me && (me.isAdmin || me.memberships.some((m) => m.group.id === groupId))
  // En el muro publican los admins; el resto del grupo lo ve y reacciona
  const canPost = !!me?.isAdmin

  // Lo que se ve aquí deja de contar como novedad (también lo que llega en tiempo real)
  const newest = posts[0]?.created_at
  useEffect(() => {
    if (newest) markWallSeen(groupId, newest)
  }, [newest, groupId])

  return (
    <div className="space-y-3">
      {canPost && (
        <Link
          to={`/muro/${groupId}/nueva`}
          className="flex min-h-16 items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand-blue"
        >
          <Avatar name={me?.profile.full_name} url={me?.profile.avatar_url} size="sm" />
          <span className="min-w-0 flex-1">
            <span className="block text-muted">Comparte algo con el grupo…</span>
            <span className="block text-xs text-muted/80">Texto, fotos, vídeos o Spotify</span>
          </span>
          <span className="flex gap-2 text-accent" aria-hidden>
            <ImagePlus className="size-5" />
            <Clapperboard className="size-5" />
            <Music className="size-5" />
          </span>
        </Link>
      )}

      {!isMember ? (
        // Aún no es del grupo: el muro es privado, puede pedir entrar
        <EmptyState icon={<Lock className="size-8" />} title="Aún no estás en este grupo" action={<JoinRequestButton groupId={groupId} groupName={groupName} />}>
          El muro solo lo ven las personas de {groupName}. Pide entrar y un admin revisará tu solicitud.
        </EmptyState>
      ) : wall.isPending ? (
        <SkeletonList count={3} className="h-48" />
      ) : wall.isError ? (
        <ErrorState error={wall.error} onRetry={() => wall.refetch()} />
      ) : !posts.length ? (
        <EmptyState icon={<MessageSquareHeart className="size-8" />} title="El muro está vacío">
          {canPost
            ? 'Comparte una foto, un vídeo o unas palabras con el grupo.'
            : 'Aquí verás lo que publiquen los admins. Para hablar con el grupo, usa el chat.'}
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
