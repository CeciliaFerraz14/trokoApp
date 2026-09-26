import { Link } from 'react-router'
import { ChevronRight, UsersRound } from 'lucide-react'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/States'
import { Badge } from '@/components/ui/Badge'
import { useMe } from '@/features/auth/useMe'
import { useWallNews } from '@/features/wall/news'

/** Pestaña "Muro": los grupos de la persona */
export function MyGroupsPage() {
  const { data: me } = useMe()
  const memberships = me?.memberships ?? []
  const news = useWallNews()

  return (
    <>
      <PageHeader title="Mis grupos" />
      <Page>
        {memberships.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-8" />} title="Aún sin grupo">
            Cuando un admin te asigne a tus grupos, aquí verás su muro, sus fotos y quién está en cada uno.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {memberships.map(({ group, role }) => (
              <li key={group.id}>
                <Link
                  to={`/muro/${group.id}`}
                  className="flex min-h-20 items-center gap-4 overflow-hidden rounded-2xl border border-line bg-surface p-4 hover:border-brand-blue"
                  style={{ boxShadow: `inset 6px 0 0 ${group.color}` }}
                >
                  <div className="min-w-0 flex-1 pl-1">
                    <p className="font-display text-2xl font-bold">{group.name}</p>
                    {group.schedule && <p className="truncate text-sm text-muted">{group.schedule}</p>}
                  </div>
                  {news.has(group.id) && <Badge tone="warning">Novedades</Badge>}
                  {role === 'coordinator' && <Badge tone="brand">Coordinas</Badge>}
                  <ChevronRight className="size-5 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Page>
    </>
  )
}
