import { Link } from 'react-router'
import { Archive, ChevronRight, Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { GroupDot } from '@/components/ui/Badge'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { useGroups } from '@/features/groups/api'

export function GroupsTab() {
  const groups = useGroups({ includeArchived: true })

  if (groups.isPending) return <SkeletonList count={6} />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />

  const active = groups.data.filter((g) => !g.archived_at)
  const archived = groups.data.filter((g) => g.archived_at)

  return (
    <div className="space-y-4">
      <Link to="/admin/grupos/nuevo" className="block">
        <Button block icon={<Plus className="size-5" />}>
          Nuevo grupo
        </Button>
      </Link>
      <GroupList groups={active} />
      {archived.length > 0 && (
        <>
          <p className="flex items-center gap-2 px-1 pt-2 text-sm font-semibold text-muted">
            <Archive className="size-4" /> Archivados
          </p>
          <GroupList groups={archived} />
        </>
      )}
    </div>
  )
}

function GroupList({ groups }: { groups: ReturnType<typeof useGroups>['data'] & {} }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {groups.map((g) => (
        <li key={g.id}>
          <Link to={`/admin/grupos/${g.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
            <GroupDot color={g.color} className="size-4" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold">{g.name}</p>
              {g.schedule && <p className="truncate text-sm text-muted">{g.schedule}</p>}
            </div>
            <ChevronRight className="size-5 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  )
}
