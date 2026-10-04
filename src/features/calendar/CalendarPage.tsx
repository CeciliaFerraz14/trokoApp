import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { format, startOfDay, startOfMonth, startOfToday } from 'date-fns'
import { CalendarDays, Plus } from 'lucide-react'
import { formatDayHeading } from '@/lib/dates'
import { SectionTitle } from '@/components/ui/Card'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { useMe } from '@/features/auth/useMe'
import { canPublish, GroupFilter, matchesGroupFilter, useGroupMap } from '@/features/groups/audience'
import type { Group } from '@/types/database'
import { EventCard } from './EventCard'
import { MonthView, monthRange, onDay } from './MonthView'
import { useEvents, type EventItem } from './api'

type View = 'proximos' | 'mes'

export function CalendarPage() {
  const { data: me } = useMe()
  const [params, setParams] = useSearchParams()
  const view = (params.get('vista') as View) || 'proximos'
  const filter = params.get('grupo')
  const groups = useGroupMap()

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  return (
    <>
      <PageHeader
        title="Calendario"
        actions={
          <>
            {canPublish(me) && (
              <HeaderLink
                to={`/calendario/nuevo${view === 'mes' && params.get('dia') ? `?dia=${params.get('dia')}` : ''}`}
                label="Nuevo evento"
              >
                <Plus className="size-6" />
              </HeaderLink>
            )}
          </>
        }
      />
      <Page className="space-y-4">
        <Tabs<View>
          value={view}
          onChange={(v) => setParam('vista', v === 'proximos' ? null : v)}
          options={[
            { value: 'proximos', label: 'Próximos' },
            { value: 'mes', label: 'Mes' },
          ]}
        />
        {view === 'proximos' ? (
          <Upcoming groups={groups} filter={filter} onFilter={(v) => setParam('grupo', v)} />
        ) : (
          <Month
            groups={groups}
            filter={filter}
            onFilter={(v) => setParam('grupo', v)}
            day={params.get('dia')}
            onDay={(d) => setParam('dia', d)}
          />
        )}
      </Page>
    </>
  )
}

interface ViewProps {
  groups: Map<string, Group>
  filter: string | null
  onFilter: (value: string | null) => void
}

function Upcoming({ groups, filter, onFilter }: ViewProps) {
  const events = useEvents(startOfToday())

  // Agrupar por día; lo que empezó antes de hoy y sigue (festival) va en "Hoy"
  const days = useMemo(() => {
    const today = startOfToday()
    const map = new Map<string, EventItem[]>()
    for (const e of (events.data ?? []).filter((e) => matchesGroupFilter(e, filter))) {
      const day = startOfDay(new Date(e.starts_at) < today ? today : new Date(e.starts_at))
      const key = day.toISOString()
      map.set(key, [...(map.get(key) ?? []), e])
    }
    return [...map.entries()]
  }, [events.data, filter])

  if (events.isPending) return <SkeletonList count={4} className="h-24" />
  if (events.isError) return <ErrorState error={events.error} onRetry={() => events.refetch()} />
  if (!events.data.length) {
    return (
      <EmptyState icon={<CalendarDays className="size-8" />} title="Nada a la vista">
        Aquí verás las clases, ensayos, bolos y festivales de tus grupos.
      </EmptyState>
    )
  }

  return (
    <>
      <GroupFilter items={events.data} groups={groups} value={filter} onChange={onFilter} />
      {!days.length && (
        <EmptyState icon={<CalendarDays className="size-8" />} title="Nada por aquí">
          No hay eventos próximos para este grupo.
        </EmptyState>
      )}
      {days.map(([day, list]) => (
        <section key={day}>
          <SectionTitle className="normal-case tracking-normal">{formatDayHeading(day)}</SectionTitle>
          <ul className="space-y-2">
            {list.map((e) => (
              <li key={e.id}>
                <EventCard event={e} groups={groups} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}

function Month({ groups, filter, onFilter, day, onDay: setDay }: ViewProps & { day: string | null; onDay: (d: string) => void }) {
  const selected = day ? new Date(`${day}T00:00:00`) : startOfToday()
  const [month, setMonth] = useState(() => startOfMonth(selected))
  const { from, to } = monthRange(month)
  const events = useEvents(from, to)
  const visible = (events.data ?? []).filter((e) => matchesGroupFilter(e, filter))
  const dayEvents = visible.filter((e) => onDay(e, selected))

  return (
    <>
      {events.data && <GroupFilter items={events.data} groups={groups} value={filter} onChange={onFilter} />}
      <MonthView
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={(d) => setDay(format(d, 'yyyy-MM-dd'))}
        events={visible}
      />
      <section>
        <SectionTitle className="normal-case tracking-normal">{formatDayHeading(selected)}</SectionTitle>
        {events.isPending ? (
          <SkeletonList count={2} className="h-24" />
        ) : events.isError ? (
          <ErrorState error={events.error} onRetry={() => events.refetch()} />
        ) : dayEvents.length ? (
          <ul className="space-y-2">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <EventCard event={e} groups={groups} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-muted">Nada este día.</p>
        )}
      </section>
    </>
  )
}
