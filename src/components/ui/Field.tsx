import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const control =
  'block w-full min-h-11 rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-base text-fg placeholder:text-muted/70 ' +
  'focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30 disabled:opacity-60'

interface FieldProps {
  label: string
  hint?: ReactNode
  error?: string | null
}

export function TextField({ label, hint, error, className, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-muted">
        {label}
      </label>
      <input id={id} aria-invalid={!!error} className={cn(control, error && 'border-danger')} {...rest} />
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  )
}

export function TextArea({ label, hint, error, className, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-muted">
        {label}
      </label>
      <textarea id={id} rows={3} aria-invalid={!!error} className={cn(control, 'resize-y', error && 'border-danger')} {...rest} />
      {error ? <p className="mt-1 text-sm text-danger">{error}</p> : hint && <p className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  )
}

/** Mensaje de error de formulario */
export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
      {children}
    </p>
  )
}
