import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { addDays, addMonths, format } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, Clock } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { fromInputs, toDateInput, toTimeInput } from '@/lib/dates'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { Switch } from '@/components/ui/Switch'
import { Tabs } from '@/components/ui/Tabs'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { AudiencePicker, canManageAudience, canPublish, useAudienceField } from '@/features/groups/audience'
import type { EventCategory } from '@/types/database'
import { CATEGORIES, CATEGORY_ORDER } from './categories'
import { MAX_OCCURRENCES, occurrences, REPEAT_LABELS, type Repeat } from './recurrence'
import { useCreateEvent, useEvent, useUpdateEvent, type EventInput, type Scope } from './api'

export function EventFormPage() {
  const { id } = useParams()
  const isNew = !id
  const [params] = useSearchParams()
  const { data: me } = useMe()
  const existing = useEvent(id)
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const navigate = useNavigate()
  const toast = useToast()

  const initialDay = params.get('dia') ?? toDateInput(new Date())
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<EventCategory>('class')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [date, setDate] = useState(initialDay)
  const [endDate, setEndDate] = useState('')
  const [startTime, setStartTime] = useState('19:00')
  const [endTime, setEndTime] = useState('21:00')
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [until, setUntil] = useState(() => toDateInput(addMonths(fromInputs(initialDay), 3)))
  const [scope, setScope] = useState<Scope>('one')
  const audience = useAudienceField({ isNew })
  const [error, setError] = useState<string | null>(null)

  // Al editar: cargar el evento una sola vez
  const loaded = existing.data
  useEffect(() => {
    if (!loaded) return
    const start = new Date(loaded.starts_at)
    const end = loaded.ends_at ? new Date(loaded.ends_at) : null
    setTitle(loaded.title)
    setCategory(loaded.category)
    setDescription(loaded.description)
    setLocation(loaded.location ?? '')
    setAllDay(loaded.all_day)
    setDate(toDateInput(start))
    setStartTime(toTimeInput(start))
    setEndTime(end && !loaded.all_day ? toTimeInput(end) : '')
    setEndDate(end && loaded.all_day && toDateInput(end) !== toDateInput(start) ? toDateInput(end) : '')
    audience.load(loaded.group_ids)
    // Solo al llegar el evento: no pisar lo que se esté escribiendo si se recarga
  }, [loaded?.id])

  const header = <PageHeader title={isNew ? 'Nuevo evento' : 'Editar evento'} back />

  if (!isNew && existing.isPending) return <>{header}<Spinner /></>
  if (!isNew && existing.isError) return <>{header}<ErrorState error={existing.error} onRetry={() => existing.refetch()} /></>
  if (isNew ? !canPublish(me) : !existing.data || !canManageAudience(me, existing.data.group_ids)) {
    return (
      <>
        {header}
        <EmptyState icon={<CalendarDays className="size-8" />} title="No puedes hacer esto">
          Solo los admins y la coordinación de cada grupo pueden crear y editar eventos.
        </EmptyState>
      </>
    )
  }

  const isSeries = !isNew && !!existing.data?.series_id
  const count = isNew && repeat !== 'none' && date && until ? occurrences(fromInputs(date), repeat, fromInputs(until)).length : 1

  function buildInput(): EventInput | string {
    if (!title.trim()) return 'El evento necesita un título.'
    if (!date) return 'Elige el día.'
    const group_ids = audience.value()
    if (!group_ids) return 'Elige al menos un grupo.'

    let starts: Date
    let ends: Date | null
    if (allDay) {
      starts = fromInputs(date)
      ends = endDate && endDate > date ? fromInputs(endDate) : null
    } else {
      if (!startTime) return 'Pon la hora de inicio.'
      starts = fromInputs(date, startTime)
      ends = endTime ? fromInputs(date, endTime) : null
      // 22:00 – 01:00: termina al día siguiente
      if (ends && ends <= starts) ends = addDays(ends, 1)
    }
    return {
      title: title.trim(),
      description: description.trim(),
      category,
      location: location.trim() || null,
      starts_at: starts.toISOString(),
      ends_at: ends?.toISOString() ?? null,
      all_day: allDay,
      group_ids,
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const input = buildInput()
    if (typeof input === 'string') return setError(input)

    if (isNew) {
      if (repeat !== 'none' && until < date) return setError('La fecha final de la repetición es anterior al primer día.')
      create.mutate(
        { input, repeat, until: fromInputs(until) },
        {
          onSuccess: ({ id: newId, count: n }) => {
            toast(n > 1 ? `${n} eventos creados` : 'Evento creado')
            navigate(`/calendario/${newId}`, { replace: true })
          },
          onError: (err) => setError(errorMessage(err)),
        },
      )
    } else {
      update.mutate(
        { event: existing.data!, input, scope: isSeries ? scope : 'one' },
        {
          onSuccess: (n) => {
            toast(n > 1 ? `${n} eventos actualizados` : 'Cambios guardados')
            navigate(`/calendario/${id}`, { replace: true })
          },
          onError: (err) => setError(errorMessage(err)),
        },
      )
    }
  }

  return (
    <>
      {header}
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <TextField label="Título" required maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Clase de Raíz" />

          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-muted">Tipo</legend>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_ORDER.map((c) => {
                const cat = CATEGORIES[c]
                const on = category === c
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setCategory(c)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition-colors',
                      on ? 'border-transparent text-brand-black' : 'border-line bg-surface-2 text-fg',
                    )}
                    style={on ? { backgroundColor: cat.color } : undefined}
                  >
                    <cat.icon className="size-4" style={on ? undefined : { color: cat.color }} aria-hidden />
                    {cat.label}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="space-y-3">
            <Switch label="Todo el día" icon={<Clock className="size-5" />} checked={allDay} onChange={setAllDay} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label={allDay ? 'Desde' : 'Día'} type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={allDay ? '' : 'col-span-2'} />
              {allDay ? (
                <TextField label="Hasta (opcional)" type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              ) : (
                <>
                  <TextField label="Empieza" type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  <TextField label="Termina (opcional)" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </>
              )}
            </div>
          </div>

          <TextField label="Lugar" maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Local de ensayo" hint="Se podrá abrir en el mapa." />
          <TextArea
            label="Detalles"
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            hint="Opcional: vestuario, qué llevar, enlaces…"
          />

          <AudiencePicker field={audience} noun="evento" />

          {isNew && (
            <fieldset className="space-y-3">
              <legend className="mb-1.5 text-sm font-semibold text-muted">Repetir</legend>
              <select
                value={repeat}
                onChange={(e) => setRepeat(e.target.value as Repeat)}
                className="block min-h-11 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-fg focus:border-brand-blue focus:ring-2 focus:ring-brand-blue/30 focus:outline-none"
              >
                {(Object.keys(REPEAT_LABELS) as Repeat[]).map((r) => (
                  <option key={r} value={r}>
                    {REPEAT_LABELS[r]}
                  </option>
                ))}
              </select>
              {repeat !== 'none' && (
                <>
                  <TextField label="Hasta el" type="date" min={date} value={until} onChange={(e) => setUntil(e.target.value)} />
                  <p className="px-1 text-sm text-muted">
                    Se {count === 1 ? 'creará 1 evento' : `crearán ${count} eventos`}
                    {date && ` desde el ${format(fromInputs(date), "d 'de' MMMM", { locale: es })}`}.
                    {count >= MAX_OCCURRENCES && ` Es el máximo; para más fechas crea otra serie.`} Cada fecha tendrá su propia asistencia y se podrá cambiar
                    o cancelar por separado.
                  </p>
                </>
              )}
            </fieldset>
          )}

          {isSeries && (
            <fieldset className="space-y-2">
              <legend className="mb-1.5 text-sm font-semibold text-muted">Este evento se repite. ¿Qué cambias?</legend>
              <Tabs<Scope>
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'one', label: 'Solo este' },
                  { value: 'following', label: 'Este y siguientes' },
                ]}
              />
              {scope === 'following' && (
                <p className="px-1 text-sm text-muted">
                  Si cambias el día o la hora, las siguientes fechas se moverán igual.
                </p>
              )}
            </fieldset>
          )}

          <FormError>{error}</FormError>
          <Button type="submit" block loading={create.isPending || update.isPending}>
            {isNew ? (count > 1 ? `Crear ${count} eventos` : 'Crear evento') : 'Guardar cambios'}
          </Button>
        </form>
      </Page>
    </>
  )
}
