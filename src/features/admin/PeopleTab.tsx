import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Search, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { displayName, useGroups } from '@/features/groups/api'
import { useAllUsers, useUserEmails } from './api'

type Filter = 'active' | 'admins' | 'rejected' | 'nogroup'
const filters: { value: Filter; label: string }[] = [
  { value: 'active', label: 'Activas' },
  { value: 'admins', label: 'Admins' },
  { value: 'nogroup', label: 'Sin grupo' },
  { value: 'rejected', label: 'Rechazadas' },
]

const normalize = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

export function PeopleTab() {
  const users = useAllUsers()
  const groups = useGroups({ includeArchived: true })
  const emails = useUserEmails()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('active')

  const groupById = useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])

  const list = useMemo(() => {
    const q = normalize(query.trim())
    return (users.data ?? []).filter((u) => {
      if (filter === 'active' && u.status !== 'active') return false
      if (filter === 'admins' && (u.role !== 'admin' || u.status !== 'active')) return false
      if (filter === 'rejected' && u.status !== 'rejected') return false
      if (filter === 'nogroup' && (u.status !== 'active' || u.memberships.length > 0)) return false
      if (!q) return true
      return normalize(`${u.full_name} ${u.nickname ?? ''} ${emails.data?.get(u.id) ?? ''}`).includes(q)
    })
  }, [users.data, query, filter, emails.data])

  if (users.isPending) return <SkeletonList count={6} />
  if (users.isError) return <ErrorState error={users.error} onRetry={() => users.refetch()} />

  return (
    <div className="space-y-3">
      <label className="relative block">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" />
        <span className="sr-only">Buscar</span>
        <input
          type="search"
          placeholder="Buscar por nombre o email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="block min-h-11 w-full rounded-full border border-line bg-surface-2 py-2.5 pr-4 pl-12 text-base focus:border-brand-blue focus:outline-none"
        />
      </label>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              'min-h-9 shrink-0 rounded-full border px-3.5 text-sm font-bold',
              filter === f.value ? 'border-transparent bg-fg text-bg' : 'border-line bg-bg text-muted',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState icon={<UsersRound className="size-8" />} title="Nadie por aquí">
          No hay personas que coincidan.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {list.map((u) => (
            <li key={u.id}>
              <Link to={`/admin/personas/${u.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface-2">
                <Avatar name={u.full_name} url={u.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    {displayName(u)}
                    {u.role === 'admin' && <Badge tone="brand">Admin</Badge>}
                  </p>
                  <p className="flex items-center gap-1 truncate text-sm text-muted">
                    {u.memberships.length
                      ? u.memberships.map((m) => {
                          const g = groupById.get(m.group_id)
                          return g ? <GroupDot key={m.group_id} color={g.color} className="size-2.5" /> : null
                        })
                      : 'Sin grupo'}
                    <span className="ml-1 truncate">{emails.data?.get(u.id)}</span>
                  </p>
                </div>
                <ChevronRight className="size-5 text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-center text-sm text-muted">{list.length} personas</p>
    </div>
  )
}
