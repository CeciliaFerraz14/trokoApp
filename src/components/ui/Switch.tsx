import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Interruptor sí/no con etiqueta y descripción; toda la fila es pulsable */
export function Switch({
  label,
  hint,
  icon,
  checked,
  onChange,
  disabled,
}: {
  label: string
  hint?: ReactNode
  icon?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? id : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2 text-left disabled:opacity-50"
    >
      {icon && <span className="text-accent">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && (
          <span id={id} className="block text-sm text-muted">
            {hint}
          </span>
        )}
      </span>
      <span
        aria-hidden
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-brand-blue' : 'bg-surface-2 ring-1 ring-line')}
      >
        <span
          className={cn(
            'absolute top-1 left-1 size-5 rounded-full shadow transition-transform',
            checked ? 'translate-x-5 bg-brand-black' : 'bg-muted',
          )}
        />
      </span>
    </button>
  )
}
