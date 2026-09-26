import { useSearchParams, useParams } from 'react-router'
import { startOfToday } from 'date-fns'
import { UserPlus, UsersRound } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList, Spinner } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { Gallery } from '@/features/wall/Gallery'
import { WallFeed } from '@/features/wall/WallFeed'
import { useGallery, useWallRealtime } from '@/features/wall/api'
import { useEvents } from '@/features/calendar/api'
import { useMe } from '@/features/auth/useMe'
import { InviteCodeCard } from './InviteCodeCard'
import { displayName, useGroup, useGroupMembers } from './api'

type Tab = 'muro' | 'galeria' | 'miembros'

export function GroupPage() {
  const { groupId } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'muro'
  const group = useGroup(groupId)
  const { data: me } = useMe()
  // Nuevas publicaciones, comentarios y reacciones aparecen solos
  useWallRealtime(groupId)
  // Cifras de la cabecera (mismas consultas que las pestañas y el calendario)
  const members = useGroupMembers(groupId)
  const gallery = useGallery(groupId)
  const events = useEvents(startOfToday())

  if (group.isPending) return <><PageHeader title="Grupo" back /><Spinner /></>
  if (group.isError) return <><PageHeader title="Grupo" back /><ErrorState error={group.error} onRetry={() => group.refetch()} /></>

  const g = group.data
  return (
    <>
      <PageHeader
        title={g.name}
        subtitle={
          <span className="flex items-center gap-1.5">
            <GroupDot color={g.color} className="ring-2 ring-brand-black/20" />
            {g.schedule || 'Grupo'}
          </span>
        }
        back
        actions={
          me?.canManageGroup(g.id) && (
            <HeaderLink to={`/muro/${g.id}?tab=miembros`} label="Invitar al grupo">
              <UserPlus className="size-5" />
            </HeaderLink>
          )
        }
      >
        <div className="grid grid-cols-3 gap-2">
          <Stat value={members.data?.length} label="personas" />
          <Stat value={gallery.data?.length} label="fotos" />
          {/* Los generales (toda la batucada) también son del grupo */}
          <Stat
            value={events.data?.filter((e) => !e.cancelled && (e.group_ids.length === 0 || e.group_ids.includes(g.id))).length}
            label="próximos"
          />
        </div>
      </PageHeader>
      <Page className="space-y-4">
        {g.description && <p className="text-muted">{g.description}</p>}
        <Tabs<Tab>
          value={tab}
          onChange={(t) => setParams({ tab: t }, { replace: true })}
          options={[
            { value: 'muro', label: 'Muro' },
            { value: 'galeria', label: 'Galería' },
            { value: 'miembros', label: 'Miembros' },
          ]}
        />
        {tab === 'muro' ? (
          <WallFeed groupId={g.id} groupName={g.name} />
        ) : tab === 'galeria' ? (
          <Gallery groupId={g.id} />
        ) : (
          <>
            {me?.canManageGroup(g.id) && <InviteCodeCard groupId={g.id} groupName={g.name} canRegenerate={me.isAdmin} />}
            <MembersList groupId={g.id} />
          </>
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

/** Cifra de la cabecera del grupo: bloque negro sobre el azul */
function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="rounded-2xl bg-brand-black py-2.5 text-center text-white">
      <p className="font-display text-2xl leading-tight font-semibold">{value ?? '–'}</p>
      <p className="text-xs text-white/70">{label}</p>
    </div>
  )
}
