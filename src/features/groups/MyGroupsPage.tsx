import { Link } from 'react-router'
import { ChevronRight, UsersRound } from 'lucide-react'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { SectionTitle } from '@/components/ui/Card'
import { EmptyState, SkeletonList } from '@/components/ui/States'
import { Badge } from '@/components/ui/Badge'
import { useMe } from '@/features/auth/useMe'
import { useWallNews } from '@/features/wall/news'
import { useGroups } from './api'
import { JoinRequestButton } from './JoinRequestButton'

/** Pestaña "Muro": mis grupos y, debajo, el resto para pedir entrar */
export function MyGroupsPage() {
  const { data: me } = useMe()
  const memberships = me?.memberships ?? []
  const news = useWallNews()
  const groups = useGroups()
  const mine = new Set(memberships.map((m) => m.group.id))
  const others = (groups.data ?? []).filter((g) => !mine.has(g.id))

  return (
    <>
      <PageHeader title="Mis grupos" />
      <Page className="space-y-6">
        {memberships.length === 0 ? (
          <EmptyState icon={<UsersRound className="size-8" />} title="Aún sin grupo">
            Pide entrar en tu grupo aquí abajo. En cuanto un admin te acepte, verás su muro, sus fotos y quién está en él.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {memberships.map(({ group, role }) => (
              <li key={group.id}>
                <Link
                  to={`/muro/${group.id}`}
                  className="flex min-h-20 items-center gap-4 overflow-hidden rounded-[1.4rem] border border-(--card-border) bg-surface p-4 hover:border-brand-blue"
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

        {groups.isPending ? (
          <SkeletonList count={2} className="h-24" />
        ) : (
          others.length > 0 && (
            <section>
              <SectionTitle>Otros grupos</SectionTitle>
              <ul className="space-y-3">
                {others.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-[1.4rem] border border-(--card-border) bg-surface p-4"
                    style={{ boxShadow: `inset 6px 0 0 ${g.color}` }}
                  >
                    {/* Un admin puede abrir cualquier grupo; el resto pide entrar */}
                    {me?.isAdmin ? (
                      <Link to={`/muro/${g.id}`} className="flex items-center gap-4 pl-1">
                        <GroupInfo name={g.name} schedule={g.schedule} description={g.description} />
                        <ChevronRight className="size-5 shrink-0 text-muted" />
                      </Link>
                    ) : (
                      <div className="space-y-3 pl-1">
                        <GroupInfo name={g.name} schedule={g.schedule} description={g.description} />
                        <JoinRequestButton groupId={g.id} groupName={g.name} compact />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )
        )}
      </Page>
    </>
  )
}

function GroupInfo({ name, schedule, description }: { name: string; schedule: string | null; description: string | null }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="font-display text-xl font-bold">{name}</p>
      {schedule && <p className="truncate text-sm text-muted">{schedule}</p>}
      {description && <p className="mt-1 text-sm text-muted">{description}</p>}
    </div>
  )
}
