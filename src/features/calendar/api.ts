import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { AttendanceStatus, CalendarEvent, EventSeriesRow, Profile } from '@/types/database'
import { occurrences, shiftOccurrence, type Repeat } from './recurrence'

export interface EventItem extends CalendarEvent {
  /** Mi respuesta de asistencia */
  myStatus: AttendanceStatus | null
}

/** Añade mi asistencia a una lista de eventos */
async function withMyStatus(rows: CalendarEvent[], userId: string): Promise<EventItem[]> {
  const mine = new Map<string, AttendanceStatus>()
  if (rows.length) {
    const { data, error } = await supabase
      .from('event_attendance')
      .select('event_id, status')
      .eq('user_id', userId)
      .in('event_id', rows.map((r) => r.id))
    if (error) throw error
    for (const r of data ?? []) mine.set(r.event_id, r.status)
  }
  return rows.map((r) => ({ ...r, myStatus: mine.get(r.id) ?? null }))
}

/**
 * Eventos que se solapan con [from, to). Sin `to`: los próximos desde `from`.
 * Un evento de varios días que empezó antes de `from` también entra.
 */
export function useEvents(from: Date, to?: Date) {
  const { session } = useAuth()
  const userId = session?.user.id
  const f = from.toISOString()
  const t = to?.toISOString()
  return useQuery({
    queryKey: ['events', userId, f, t ?? null],
    queryFn: async () => {
      let q = supabase
        .from('events')
        .select('*')
        .or(`starts_at.gte.${f},ends_at.gte.${f}`)
        .order('starts_at')
        .limit(t ? 500 : 150)
      if (t) q = q.lt('starts_at', t)
      const { data, error } = await q
      if (error) throw error
      return withMyStatus(data ?? [], userId!)
    },
    enabled: !!userId,
  })
}

export type EventCreator = Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'>

export function useEvent(id: string | undefined) {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['event', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*, creator:profiles!events_created_by_fkey(id, full_name, nickname, avatar_url)')
        .eq('id', id!)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const { creator, ...event } = data as CalendarEvent & { creator: EventCreator | null }
      const [item] = await withMyStatus([event], userId!)
      return { ...item, creator }
    },
    enabled: !!id && !!userId,
  })
}

export interface Attendee {
  status: AttendanceStatus
  profile: EventCreator
}

/** Quién ha respondido (solo cuentas activas visibles) */
export function useAttendees(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-attendees', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_attendance')
        .select('status, profile:profiles(id, full_name, nickname, avatar_url)')
        .eq('event_id', eventId!)
      if (error) throw error
      return (data ?? []).filter((r): r is Attendee => !!r.profile)
    },
    enabled: !!eventId,
  })
}

export function useMyNote(eventId: string | undefined) {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['event-note', eventId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_notes')
        .select('note')
        .eq('event_id', eventId!)
        .eq('user_id', userId!)
        .maybeSingle()
      if (error) throw error
      return data?.note ?? ''
    },
    enabled: !!eventId && !!userId,
    // Siempre al servidor al abrir: la copia sin conexión se guarda cada 2 s y
    // podría traer una nota anterior si se cerró la app justo después de guardar
    staleTime: 0,
  })
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

function useInvalidateEvents() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['events'] }),
      qc.invalidateQueries({ queryKey: ['event'] }),
      qc.invalidateQueries({ queryKey: ['event-attendees'] }),
    ])
}

/** Mi respuesta. status = null → quitarla */
export function useSetAttendance() {
  const { session } = useAuth()
  const userId = session?.user.id
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: AttendanceStatus | null }) => {
      const { error } =
        status === null
          ? await supabase.from('event_attendance').delete().eq('event_id', eventId).eq('user_id', userId!)
          : await supabase
              .from('event_attendance')
              .upsert({ event_id: eventId, user_id: userId!, status }, { onConflict: 'event_id,user_id' })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useSaveNote() {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ eventId, note }: { eventId: string; note: string }) => {
      const { error } = note.trim()
        ? await supabase
            .from('event_notes')
            .upsert({ event_id: eventId, user_id: userId!, note: note.trim() }, { onConflict: 'event_id,user_id' })
        : await supabase.from('event_notes').delete().eq('event_id', eventId).eq('user_id', userId!)
      if (error) throw error
    },
    onSuccess: (_d, { eventId, note }) => qc.setQueryData(['event-note', eventId, userId], note.trim()),
  })
}

export type EventInput = Pick<
  CalendarEvent,
  'title' | 'description' | 'category' | 'location' | 'starts_at' | 'ends_at' | 'all_day' | 'group_ids'
>

/** Crea un evento o, si se repite, toda la serie de una vez. Devuelve el id del primero */
export function useCreateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ input, repeat, until }: { input: EventInput; repeat: Repeat; until: Date }) => {
      const start = new Date(input.starts_at)
      const duration = input.ends_at ? new Date(input.ends_at).getTime() - start.getTime() : null
      const dates = occurrences(start, repeat, until)
      const series_id = dates.length > 1 ? crypto.randomUUID() : null
      const rows = dates.map((d) => ({
        ...input,
        starts_at: d.toISOString(),
        // Misma duración en hora local (un festival de 3 días sigue durando 3 días)
        ends_at: duration === null ? null : endFrom(d, start, new Date(input.ends_at!)).toISOString(),
        series_id,
      }))
      const { data, error } = await supabase.from('events').insert(rows).select('id, starts_at').order('starts_at')
      if (error) throw error
      return { id: data[0].id, count: data.length }
    },
    onSuccess: invalidate,
  })
}

/** Fin de una repetición: se mueve los mismos días que su inicio y conserva su hora (local) */
function endFrom(occurrence: Date, firstStart: Date, firstEnd: Date) {
  return addDays(firstEnd, differenceInCalendarDays(occurrence, firstStart))
}

export type Scope = 'one' | 'following'

/**
 * Guarda cambios de un evento. Con scope 'following' se aplican a esta fecha y
 * a las siguientes de la serie: mismos textos y grupos, y el mismo cambio de
 * día/hora que se haya hecho en esta.
 */
export function useUpdateEvent() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ event, input, scope }: { event: CalendarEvent; input: EventInput; scope: Scope }) => {
      if (scope === 'one' || !event.series_id) {
        const { error } = await supabase.from('events').update(input).eq('id', event.id)
        if (error) throw error
        return 1
      }

      const { data: series, error } = await supabase
        .from('events')
        .select('id, starts_at')
        .eq('series_id', event.series_id)
        .gte('starts_at', event.starts_at)
      if (error) throw error

      const oldStart = new Date(event.starts_at)
      const newStart = new Date(input.starts_at)
      const newEnd = input.ends_at ? new Date(input.ends_at) : null
      const rows: EventSeriesRow[] = (series ?? []).map((r) => {
        const start = shiftOccurrence(new Date(r.starts_at), oldStart, newStart)
        return {
          ...input,
          id: r.id,
          starts_at: start.toISOString(),
          ends_at: newEnd ? endFrom(start, newStart, newEnd).toISOString() : null,
        }
      })
      const { data: n, error: e2 } = await supabase.rpc('update_event_series', { p_rows: rows })
      if (e2) throw e2
      return n
    },
    onSuccess: invalidate,
  })
}

export function useDeleteEvent() {
  const qc = useQueryClient()
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ event, scope }: { event: CalendarEvent; scope: Scope }) => {
      const { error } =
        scope === 'following' && event.series_id
          ? await supabase.from('events').delete().eq('series_id', event.series_id).gte('starts_at', event.starts_at)
          : await supabase.from('events').delete().eq('id', event.id)
      if (error) throw error
    },
    onSuccess: (_d, { event }) => {
      qc.removeQueries({ queryKey: ['event', event.id] })
      return invalidate()
    },
  })
}

export function useSetCancelled() {
  const invalidate = useInvalidateEvents()
  return useMutation({
    mutationFn: async ({ id, cancelled }: { id: string; cancelled: boolean }) => {
      const { error } = await supabase.from('events').update({ cancelled }).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
