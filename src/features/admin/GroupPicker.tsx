import { Check } from 'lucide-react'
import { cn } from '@/lib/cn'
import type { Group } from '@/types/database'

/** Chips seleccionables de grupos */
export function GroupPicker({
  groups,
  selected,
  onToggle,
}: {
  groups: Group[]
  selected: Set<string>
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {groups.map((g) => {
        const on = selected.has(g.id)
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(g.id)}
            className={cn(
              'inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 text-sm font-bold transition-colors',
              on ? 'border-transparent text-black' : 'border-line bg-surface-2 text-fg',
            )}
            style={on ? { backgroundColor: g.color } : undefined}
          >
            {on ? <Check className="size-4" /> : <span className="size-3 rounded-full" style={{ backgroundColor: g.color }} />}
            {g.name}
          </button>
        )
      })}
    </div>
  )
}
