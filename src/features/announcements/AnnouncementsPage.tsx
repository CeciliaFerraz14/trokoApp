import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Megaphone, Plus } from 'lucide-react'
import { SectionTitle } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { InstallBanner } from '@/features/install/InstallBanner'
import { NextEvent } from '@/features/calendar/NextEvent'
import { useMe } from '@/features/auth/useMe'
import { canPublish, GroupFilter, matchesGroupFilter, useGroupMap } from '@/features/groups/audience'
import { AnnouncementCard } from './AnnouncementCard'
import { useAnnouncements, useMarkRead, type AnnouncementItem } from './api'

export function AnnouncementsPage() {
  const { data: me } = useMe()
  const name = me?.profile.nickname || me?.profile.full_name.split(' ')[0]
  const list = useAnnouncements()
  const markRead = useMarkRead()
  const [params, setParams] = useSearchParams()
  const filter = params.get('grupo')

  const groupMap = useGroupMap()
  const items = useMemo(() => (list.data ?? []).filter((a) => matchesGroupFilter(a, filter)), [list.data, filter])

  // Los no leídos se marcan como leídos al verlos, pero siguen resaltados
  // como "Nuevo" mientras la pantalla esté abierta
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const unreadIds = items.filter((a) => !a.read).map((a) => a.id)
  const unreadKey = unreadIds.join()
  useEffect(() => {
    if (!unreadKey) return
    const ids = unreadKey.split(',')
    setFresh((prev) => new Set([...prev, ...ids]))
    const t = setTimeout(() => markRead.mutate(ids), 1500)
    return () => clearTimeout(t)
  }, [unreadKey])

  const pinned = items.filter((a) => a.pinned)
  const rest = items.filter((a) => !a.pinned)
  const card = (a: AnnouncementItem) => (
    <li key={a.id}>
      <AnnouncementCard item={a} groups={groupMap} highlight={fresh.has(a.id)} />
    </li>
  )

  return (
    <>
      <PageHeader
        title="Avisos"
        subtitle={name ? `¡Hola, ${name}!` : undefined}
        actions={
          canPublish(me) && (
            <Link
              to="/avisos/nuevo"
              aria-label="Nuevo aviso"
              title="Nuevo aviso"
              className="grid size-11 place-items-center rounded-full bg-brand-blue text-brand-black hover:bg-brand-blue-light"
            >
              <Plus className="size-6" />
            </Link>
          )
        }
      />
      <InstallBanner />
      <Page className="space-y-4">
        <NextEvent />
        {list.isPending ? (
          <SkeletonList count={4} className="h-32" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : !list.data.length ? (
          <EmptyState icon={<Megaphone className="size-8" />} title="Aún no hay avisos">
            Aquí aparecerán las novedades de la batucada y de tus grupos.
          </EmptyState>
        ) : (
          <>
            <GroupFilter
              items={list.data}
              groups={groupMap}
              value={filter}
              onChange={(v) => setParams(v ? { grupo: v } : {}, { replace: true })}
            />
            {!items.length && (
              <EmptyState icon={<Megaphone className="size-8" />} title="Nada por aquí">
                No hay avisos para este grupo.
              </EmptyState>
            )}
            {pinned.length > 0 && (
              <section>
                <SectionTitle>Fijados</SectionTitle>
                <ul className="space-y-3">{pinned.map(card)}</ul>
              </section>
            )}
            {rest.length > 0 && (
              <section>
                {pinned.length > 0 && <SectionTitle>Últimos avisos</SectionTitle>}
                <ul className="space-y-3">{rest.map(card)}</ul>
              </section>
            )}
          </>
        )}
      </Page>
    </>
  )
}
