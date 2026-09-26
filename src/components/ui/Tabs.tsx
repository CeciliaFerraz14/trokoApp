import { cn } from '@/lib/cn'

interface Props<T extends string> {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; count?: number }[]
}

/** Pestañas dentro de una página: píldoras separadas, la elegida en blanco (negro en tema claro) */
export function Tabs<T extends string>({ value, onChange, options }: Props<T>) {
  return (
    <div role="tablist" className="flex gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full border px-3 font-display text-sm font-semibold transition-colors',
            value === o.value ? 'border-transparent bg-fg text-bg' : 'border-line bg-bg text-fg hover:border-brand-blue',
          )}
        >
          {o.label}
          {!!o.count && <span className="rounded-full bg-brand-blue px-1.5 text-xs text-brand-black">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}
