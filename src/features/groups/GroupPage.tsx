import { useSearchParams, useParams } from 'react-router'
import { MessageSquareHeart, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { displayName, useGroup, useGroupMembers } from './api'

type Tab = 'muro' | 'miembros'

export function GroupPage() {
  const { groupId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'muro'
  const group = useGroup(groupId)

  if (group.isPending) return <><PageHeader title="Grupo" back /><Spinner /></>
  if (group.isError) return <><PageHeader title="Grupo" back /><ErrorState error={group.error} onRetry={() => group.refetch()} /></>

  const g = group.data
  return (
    <>
      <PageHeader title={g.name} subtitle={g.schedule} back />
      <div className="h-1.5" style={{ backgroundColor: g.color }} />
      <Page className="space-y-4">
        {g.description && <p className="text-muted">{g.description}</p>}
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'muro', label: 'Muro' },
            { value: 'miembros', label: 'Miembros' },
          ]}
        />
        {tab === 'muro' ? (
          <EmptyState icon={<MessageSquareHeart className="size-8" />} title="El muro está en camino">
            Pronto podréis compartir fotos, comentarios y reacciones con el grupo.
          </EmptyState>
        ) : (
          <MembersList groupId={g.id} />
        )}
      </Page>
    </>
  )
}

function MembersList({ groupId }: { groupId: string }) {
  const members = useGroupMembers(groupId)
  if (members.isPending) return <SkeletonList count={5} className="h-14" />
  if (members.isError) return <ErrorState error={members.error} onRetry={() => members.refetch()} />
  if (!members.data.length) {
    return (
      <EmptyState icon={<UsersRound className="size-8" />} title="Sin miembros">
        Todavía no hay nadie en este grupo.
      </EmptyState>
    )
  }
  return (
    <>
      <p className="px-1 text-sm text-muted">
        <UsersRound className="mr-1 inline size-4" />
        {members.data.length} personas
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {members.data.map(({ profile, role }) => (
          <li key={profile.id} className="flex min-h-16 items-center gap-3 px-4 py-2">
            <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{displayName(profile)}</p>
              {profile.instruments.length > 0 && <p className="truncate text-sm text-muted">{profile.instruments.join(' · ')}</p>}
            </div>
            {role === 'coordinator' && <Badge tone="brand">Coordina</Badge>}
          </li>
        ))}
      </ul>
    </>
  )
}
