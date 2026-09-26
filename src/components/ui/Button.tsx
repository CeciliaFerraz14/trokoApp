import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-blue text-brand-black hover:bg-brand-blue-light active:bg-brand-blue-dark',
  secondary: 'bg-surface-2 text-fg border border-line hover:border-brand-blue',
  ghost: 'text-accent hover:bg-surface-2',
  // Fondo opaco (no transparente) para que no se vea el motivo del fondo a través
  danger: 'bg-bg text-danger border border-danger/60 hover:bg-[color-mix(in_srgb,var(--danger)_10%,var(--bg))]',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  loading?: boolean
  icon?: ReactNode
  block?: boolean
}

export function Button({ variant = 'primary', loading, icon, block, className, children, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        // min-h-11 = 44 px: zona táctil mínima recomendada
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 font-display text-base font-semibold',
        'transition-colors select-none disabled:cursor-not-allowed disabled:opacity-50',
        variants[variant],
        block && 'w-full',
        className,
      )}
    >
      {loading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

/** Botón de solo icono, 44×44 */
export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-11 items-center justify-center rounded-full text-fg transition-colors hover:bg-white/10 disabled:opacity-50',
        className,
      )}
    >
      {children}
    </button>
  )
}
