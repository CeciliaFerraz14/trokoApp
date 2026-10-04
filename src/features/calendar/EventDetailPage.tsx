import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Ban, CalendarDays, CalendarPlus, MapPin, Pencil, Repeat, RotateCcw, StickyNote, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatDayHeading, formatEventTime } from '@/lib/dates'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { TextArea } from '@/components/ui/Field'
import { Linkify } from '@/components/ui/Linkify'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import { Audience, canManageAudience, useGroupMap } from '@/features/groups/audience'
import type { AttendanceStatus } from '@/types/database'
import { categoryOf } from './categories'
import { STATUS_UI } from './EventCard'
import {
  icsUrl,
  useAttendees,
  useCalendarToken,
  useDeleteEvent,
  useEvent,
  useMyNote,
  useSaveNote,
  useSetAttendance,
  useSetCancelled,
  type Scope,
} from './api'

export function EventDetailPage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const query = useEvent(id)
  const groups = useGroupMap()
  const cancel = useSetCancelled()
  const remove = useDeleteEvent()
  const navigate = useNavigate()
  const toast = useToast()
  const [askDelete, setAskDelete] = useState(false)

  if (query.isPending) return <><PageHeader title="Evento" back="/calendario" /><Spinner /></>
  if (query.isError) return <><PageHeader title="Evento" back="/calendario" /><ErrorState error={query.error} onRetry={() => query.refetch()} /></>
  const e = query.data
  if (!e) {
    return (
      <>
        <PageHeader title="Evento" back="/calendario" />
        <EmptyState icon={<CalendarDays className="size-8" />} title="Evento no encontrado">
          Puede que se haya borrado o que no sea de tus grupos.
        </EmptyState>
      </>
    )
  }

  const cat = categoryOf(e.category)
  const canManage = canManageAudience(me, e.group_ids)

  const toggleCancel = () => {
    if (!e.cancelled && !confirm('¿Cancelar este evento? Seguirá en el calendario marcado como cancelado.')) return
    cancel.mutate(
      { id: e.id, cancelled: !e.cancelled },
      { onSuccess: () => toast(e.cancelled ? 'Evento reactivado' : 'Evento cancelado'), onError: (err) => toast(errorMessage(err), 'error') },
    )
  }
  const doDelete = (scope: Scope) =>
    remove.mutate(
      { event: e, scope },
      {
        onSuccess: () => {
          toast(scope === 'following' ? 'Eventos borrados' : 'Evento borrado')
          navigate('/calendario', { replace: true })
        },
        onError: (err) => toast(errorMessage(err), 'error'),
      },
    )
  const onDelete = () => {
    if (e.series_id) return setAskDelete(true)
    if (confirm('¿Borrar este evento? Se borrarán también las respuestas de asistencia.')) doDelete('one')
  }

  return (
    <>
      <PageHeader
        title="Evento"
        back="/calendario"
        actions={
          canManage && (
            <HeaderLink to={`/calendario/${e.id}/editar`} label="Editar evento">
              <Pencil className="size-5" />
            </HeaderLink>
          )
        }
      />
      <Page className="space-y-5">
        <article className="space-y-4">
          {e.cancelled && (
            <p role="status" className="flex items-center gap-2 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 font-semibold text-danger">
              <Ban className="size-5 shrink-0" aria-hidden /> Este evento se ha cancelado
            </p>
          )}
          <p className="flex items-center gap-2 font-display font-semibold" style={{ color: cat.color }}>
            <cat.icon className="size-5" aria-hidden /> {cat.label}
            {e.series_id && (
              <span className="flex items-center gap-1 text-sm text-muted">
                · <Repeat className="size-3.5" aria-hidden /> Se repite
              </span>
            )}
          </p>
          <h2 className={cn('font-display text-3xl leading-tight font-bold', e.cancelled && 'line-through')}>{e.title}</h2>
          <div className="space-y-2 text-lg">
            <p className="flex items-start gap-3">
              <CalendarDays className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
              <span>
                <span className="font-semibold">{formatDayHeading(e.starts_at)}</span>
                <br />
                <span className="text-muted">{formatEventTime(e)}</span>
              </span>
            </p>
            {e.location && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-3"
              >
                <MapPin className="mt-1 size-5 shrink-0 text-accent" aria-hidden />
                <span className="font-semibold text-accent underline underline-offset-2">{e.location}</span>
              </a>
            )}
          </div>
          {e.description && <Linkify text={e.description} className="leading-relaxed" />}
          <Card className="space-y-2 text-sm text-muted">
            <div>
              <p className="mb-1 font-semibold text-fg">Para</p>
              <Audience groupIds={e.group_ids} groups={groups} />
            </div>
            {e.creator && <p>Creado por {displayName(e.creator)}</p>}
          </Card>
        </article>

        <Attendance eventId={e.id} myStatus={e.myStatus} disabled={e.cancelled} />
        <MyNote eventId={e.id} />
        <AddToCalendar eventId={e.id} />

        {canManage && (
          <section className="space-y-3 border-t border-line pt-5">
            <SectionTitle>Gestionar</SectionTitle>
            <Button
              variant="secondary"
              block
              loading={cancel.isPending}
              onClick={toggleCancel}
              icon={e.cancelled ? <RotateCcw className="size-4" /> : <Ban className="size-4" />}
            >
              {e.cancelled ? 'Reactivar evento' : 'Cancelar este evento'}
            </Button>
            {askDelete ? (
              <Card className="space-y-2">
                <p className="font-semibold">Este evento se repite. ¿Qué quieres borrar?</p>
                <Button variant="danger" block loading={remove.isPending} onClick={() => doDelete('one')}>
                  Solo este
                </Button>
                <Button variant="danger" block loading={remove.isPending} onClick={() => doDelete('following')}>
                  Este y los siguientes
                </Button>
                <Button variant="ghost" block onClick={() => setAskDelete(false)}>
                  No borrar nada
                </Button>
              </Card>
            ) : (
              <Button variant="danger" block loading={remove.isPending} onClick={onDelete} icon={<Trash2 className="size-4" />}>
                Borrar evento
              </Button>
            )}
          </section>
        )}
      </Page>
    </>
  )
}

const STATUSES: AttendanceStatus[] = ['yes', 'maybe', 'no']

function Attendance({ eventId, myStatus, disabled }: { eventId: string; myStatus: AttendanceStatus | null; disabled: boolean }) {
  const attendees = useAttendees(eventId)
  const set = useSetAttendance()
  const toast = useToast()
  // Respuesta optimista: se ve marcada al momento
  const [pending, setPending] = useState<AttendanceStatus | null | undefined>(undefined)
  const current = pending === undefined ? myStatus : pending

  const choose = (status: AttendanceStatus) => {
    const next = current === status ? null : status
    setPending(next)
    set.mutate(
      { eventId, status: next },
      {
        onError: (err) => toast(errorMessage(err), 'error'),
        onSettled: () => setPending(undefined),
      },
    )
  }

  const byStatus = (s: AttendanceStatus) => (attendees.data ?? []).filter((a) => a.status === s)
  const going = byStatus('yes')
  const maybe = byStatus('maybe')

  return (
    <section>
      <SectionTitle>¿Vas?</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        {STATUSES.map((s) => {
          const ui = STATUS_UI[s]
          const on = current === s
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => choose(s)}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-2xl border font-display font-semibold transition-colors disabled:opacity-50',
                on
                  ? s === 'yes'
                    ? 'border-transparent bg-success text-brand-black'
                    : s === 'maybe'
                      ? 'border-transparent bg-warning text-brand-black'
                      : 'border-transparent bg-fg text-bg'
                  : 'border-line bg-surface hover:border-brand-blue',
              )}
            >
              <ui.icon className="size-5" aria-hidden />
              {ui.label}
            </button>
          )
        })}
      </div>
      {attendees.data && (going.length > 0 || maybe.length > 0) && (
        <details className="mt-3 rounded-2xl border border-line bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-semibold">
            {going.length} {going.length === 1 ? 'va' : 'van'}
            {maybe.length > 0 && ` · ${maybe.length} quizá`}
          </summary>
          <div className="space-y-3 px-4 pb-4">
            {[
              { title: 'Van', list: going },
              { title: 'Quizá', list: maybe },
            ]
              .filter((g) => g.list.length)
              .map((g) => (
                <div key={g.title}>
                  <p className="mb-1.5 text-xs font-bold tracking-wider text-muted uppercase">{g.title}</p>
                  <ul className="flex flex-wrap gap-x-4 gap-y-2">
                    {g.list.map(({ profile }) => (
                      <li key={profile.id} className="flex items-center gap-2 text-sm">
                        <Avatar name={profile.full_name} url={profile.avatar_url} size="sm" className="size-7 text-xs" />
                        {displayName(profile)}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        </details>
      )}
    </section>
  )
}

function MyNote({ eventId }: { eventId: string }) {
  const note = useMyNote(eventId)
  const save = useSaveNote()
  const toast = useToast()
  const [value, setValue] = useState('')
  useEffect(() => {
    if (note.data !== undefined) setValue(note.data)
  }, [note.data])

  const onBlur = () => {
    if (note.data === undefined || value.trim() === note.data) return
    save.mutate({ eventId, note: value }, { onSuccess: () => toast('Nota guardada'), onError: (err) => toast(errorMessage(err), 'error') })
  }

  return (
    <section>
      <SectionTitle className="flex items-center gap-1.5">
        <StickyNote className="size-4" aria-hidden /> Mi nota
      </SectionTitle>
      <TextArea
        label="Solo la ves tú"
        placeholder="Llevar el surdo, ropa blanca…"
        maxLength={2000}
        value={value}
        disabled={note.isPending}
        onChange={(ev) => setValue(ev.target.value)}
        onBlur={onBlur}
        hint={save.isPending ? 'Guardando…' : 'Se guarda al salir del campo.'}
      />
    </section>
  )
}

function AddToCalendar({ eventId }: { eventId: string }) {
  const token = useCalendarToken()
  if (!token.data) return null
  return (
    <a href={icsUrl(token.data, eventId)} className="block">
      <Button variant="secondary" block icon={<CalendarPlus className="size-4" />} tabIndex={-1}>
        Añadir a mi calendario
      </Button>
    </a>
  )
}
