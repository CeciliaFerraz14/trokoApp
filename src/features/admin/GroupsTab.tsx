import { Link } from 'react-router'
import { Archive, ArrowDown, ArrowUp, ChevronRight, Plus } from 'lucide-react'
import { Button, IconButton } from '@/components/ui/Button'
import { GroupDot } from '@/components/ui/Badge'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { useGroups } from '@/features/groups/api'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'
import type { Group } from '@/types/database'
import { useReorderGroups } from './api'

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
      {active.length > 1 && <p className="px-1 text-sm text-muted">Usa las flechas para cambiar el orden en que aparecen los grupos en toda la app.</p>}
      <GroupList groups={active} reorder />
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

function GroupList({ groups, reorder = false }: { groups: Group[]; reorder?: boolean }) {
  const move = useReorderGroups()
  const toast = useToast()
  const swap = (i: number, j: number) => {
    const next = [...groups]
    ;[next[i], next[j]] = [next[j], next[i]]
    move.mutate(next, { onError: (e) => toast(errorMessage(e), 'error') })
  }

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {groups.map((g, i) => (
        <li key={g.id} className="flex items-center">
          <Link to={`/admin/grupos/${g.id}`} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
            <GroupDot color={g.color} className="size-4" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold">{g.name}</p>
              {g.schedule && <p className="truncate text-sm text-muted">{g.schedule}</p>}
            </div>
            {!reorder && <ChevronRight className="size-5 text-muted" />}
          </Link>
          {reorder && (
            <div className="flex shrink-0 pr-2">
              <IconButton label={`Subir ${g.name}`} disabled={i === 0} onClick={() => swap(i, i - 1)} className="text-accent disabled:opacity-25">
                <ArrowUp className="size-5" />
              </IconButton>
              <IconButton
                label={`Bajar ${g.name}`}
                disabled={i === groups.length - 1}
                onClick={() => swap(i, i + 1)}
                className="text-accent disabled:opacity-25"
              >
                <ArrowDown className="size-5" />
              </IconButton>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
