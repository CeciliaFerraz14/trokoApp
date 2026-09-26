// Destinatarios de avisos y eventos: "toda la batucada" (group_ids vacío) o
// una lista de grupos. Selector para formularios, etiqueta y filtro por grupo.
import { useEffect, useMemo, useState } from 'react'
import { Megaphone, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { GroupDot } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/States'
import { Tabs } from '@/components/ui/Tabs'
import { GroupPicker } from '@/features/admin/GroupPicker'
import { useMe, type Me } from '@/features/auth/useMe'
import type { Group } from '@/types/database'
import { useGroups } from './api'

export type AudienceMode = 'general' | 'grupos'

/** Grupos que coordina (un admin, además, puede publicar en cualquiera y para toda la batucada) */
export function coordinatedGroupIds(me: Me | undefined) {
  return me?.memberships.filter((m) => m.role === 'coordinator').map((m) => m.group.id) ?? []
}

/** Puede publicar avisos y crear eventos */
export function canPublish(me: Me | undefined) {
  return !!me && (me.isAdmin || coordinatedGroupIds(me).length > 0)
}

/** Puede gestionar algo dirigido a estos grupos (mismo criterio que can_publish_for_groups en la BD) */
export function canManageAudience(me: Me | undefined, groupIds: string[]) {
  if (!me) return false
  if (me.isAdmin) return true
  const mine = new Set(coordinatedGroupIds(me))
  return groupIds.length > 0 && groupIds.every((id) => mine.has(id))
}

/** Grupos que la persona puede elegir como destinatarios */
export function usePublishableGroups() {
  const { data: me } = useMe()
  const isAdmin = !!me?.isAdmin
  const all = useGroups()
  const groups = useMemo<Group[]>(() => {
    if (isAdmin) return all.data ?? []
    const mine = new Set(coordinatedGroupIds(me))
    return me?.memberships.filter((m) => mine.has(m.group.id)).map((m) => m.group) ?? []
  }, [isAdmin, all.data, me])
  return { groups, isAdmin, isPending: isAdmin && all.isPending }
}

/** Estado del campo "¿Para quién es?" de un formulario */
export function useAudienceField({ isNew }: { isNew: boolean }) {
  const { groups, isAdmin } = usePublishableGroups()
  const [mode, setMode] = useState<AudienceMode>(isAdmin ? 'general' : 'grupos')
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // Al crear: si solo coordina un grupo, ya viene marcado
  useEffect(() => {
    if (isNew && !isAdmin && groups.length === 1) setSelected(new Set([groups[0].id]))
  }, [isNew, isAdmin, groups])

  return {
    mode,
    setMode,
    selected,
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    /** Rellenar al editar */
    load: (groupIds: string[]) => {
      setMode(groupIds.length ? 'grupos' : 'general')
      setSelected(new Set(groupIds))
    },
    /**
     * group_ids para guardar, o null si faltan grupos. Un grupo archivado que
     * ya estuviera no se muestra en el selector, así que se quita.
     */
    value: (): string[] | null => {
      if (mode === 'general') return []
      const choosable = new Set(groups.map((g) => g.id))
      const ids = [...selected].filter((id) => choosable.has(id))
      return ids.length ? ids : null
    },
  }
}

/** Bloque "¿Para quién es?" de los formularios */
export function AudiencePicker({
  field: { mode, setMode, selected, toggle },
  noun,
}: {
  field: ReturnType<typeof useAudienceField>
  /** "Verán este…": "aviso", "evento" */
  noun: string
}) {
  const { groups, isAdmin, isPending } = usePublishableGroups()
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1.5 text-sm font-semibold text-muted">¿Para quién es?</legend>
      {isAdmin && (
        <Tabs<AudienceMode>
          value={mode}
          onChange={setMode}
          options={[
            { value: 'general', label: 'Toda la batucada' },
            { value: 'grupos', label: 'Algunos grupos' },
          ]}
        />
      )}
      {mode === 'general' ? (
        <p className="flex items-center gap-2 px-1 text-sm text-muted">
          <Megaphone className="size-4" aria-hidden /> Verán este {noun} todas las personas de la app.
        </p>
      ) : isPending ? (
        <Spinner />
      ) : (
        <>
          <GroupPicker groups={groups} selected={selected} onToggle={toggle} />
          <p className="flex items-center gap-2 px-1 text-sm text-muted">
            <UsersRound className="size-4" aria-hidden /> Solo lo verán las personas de esos grupos.
          </p>
        </>
      )}
    </fieldset>
  )
}

/** A quién va dirigido: "Toda la batucada" o los grupos con su color */
export function Audience({ groupIds, groups, className }: { groupIds: string[]; groups: Map<string, Group>; className?: string }) {
  const named = groupIds.map((id) => groups.get(id)).filter((g): g is Group => !!g)
  if (!groupIds.length) {
    return (
      <span className={cn('inline-flex items-center gap-1.5', className)}>
        <Megaphone className="size-3.5 shrink-0" aria-hidden /> Toda la batucada
      </span>
    )
  }
  return (
    <span className={cn('flex flex-wrap items-center gap-x-3 gap-y-1', className)}>
      {named.map((g) => (
        <span key={g.id} className="inline-flex items-center gap-1.5">
          <GroupDot color={g.color} className="size-2.5" />
          {g.name}
        </span>
      ))}
    </span>
  )
}

/** Mapa id → grupo (incluidos archivados) para pintar destinatarios */
export function useGroupMap() {
  const groups = useGroups({ includeArchived: true })
  return useMemo(() => new Map((groups.data ?? []).map((g) => [g.id, g])), [groups.data])
}

export const GENERAL_FILTER = 'general'

export function matchesGroupFilter(item: { group_ids: string[] }, filter: string | null) {
  if (!filter) return true
  if (filter === GENERAL_FILTER) return item.group_ids.length === 0
  return item.group_ids.includes(filter)
}

/** Chips para filtrar por destinatarios. Solo aparecen si hay más de un tipo */
export function GroupFilter({
  items,
  groups,
  value,
  onChange,
}: {
  items: { group_ids: string[] }[]
  groups: Map<string, Group>
  value: string | null
  onChange: (value: string | null) => void
}) {
  const hasGeneral = items.some((a) => a.group_ids.length === 0)
  const used = [...new Set(items.flatMap((a) => a.group_ids))]
    .map((id) => groups.get(id))
    .filter((g): g is Group => !!g)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es'))

  if ((hasGeneral ? 1 : 0) + used.length < 2) return null

  const chip = (key: string | null, label: string, color?: string) => (
    <button
      key={key ?? 'all'}
      type="button"
      aria-pressed={value === key}
      onClick={() => onChange(key)}
      className={cn(
        'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition-colors',
        value === key ? 'border-transparent bg-fg text-bg' : 'border-line bg-bg text-fg',
      )}
    >
      {color && <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} />}
      {label}
    </button>
  )

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {chip(null, 'Todos')}
      {hasGeneral && chip(GENERAL_FILTER, 'Generales')}
      {used.map((g) => chip(g.id, g.name, g.color))}
    </div>
  )
}
