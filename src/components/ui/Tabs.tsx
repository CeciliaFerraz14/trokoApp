import { cn } from '@/lib/cn'

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
}

/** Selector segmentado (pestañas dentro de una página) */
export function Tabs<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div role="tablist" className="flex gap-1 rounded-full bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-full px-3 font-display text-sm font-semibold transition-colors',
            value === o.value ? 'bg-brand-blue text-brand-black' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
          {!!o.count && (
            <span className={cn('rounded-full px-1.5 text-xs', value === o.value ? 'bg-black/20' : 'bg-brand-blue text-brand-black')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
