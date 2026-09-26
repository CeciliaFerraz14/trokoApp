import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Megaphone, Plus } from 'lucide-react'
import { SectionTitle } from '@/components/ui/Card'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
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
  const initials = (me?.profile.full_name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
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
        title={name ?? 'Avisos'}
        subtitle={greeting()}
        leading={
          <Link
            to="/perfil"
            aria-label="Mi perfil"
            className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-brand-black font-display text-lg font-semibold text-brand-blue"
          >
            {me?.profile.avatar_url ? <img src={me.profile.avatar_url} alt="" className="size-full object-cover" /> : initials}
          </Link>
        }
        actions={
          canPublish(me) && (
            <HeaderLink to="/avisos/nuevo" label="Nuevo aviso">
              <Plus className="size-6" />
            </HeaderLink>
          )
        }
      >
        <NextEvent />
      </PageHeader>
      <InstallBanner />
      <Page className="space-y-4">
        <h2 className="px-1 font-display text-2xl font-semibold">Avisos</h2>
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

function greeting(now = new Date()) {
  const h = now.getHours()
  return h >= 6 && h < 14 ? 'Buenos días' : h >= 14 && h < 21 ? 'Buenas tardes' : 'Buenas noches'
}
