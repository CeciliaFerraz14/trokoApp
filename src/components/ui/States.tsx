import type { ReactNode } from 'react'
import { AlertTriangle, Loader2, RotateCw } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from './Button'

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Loader2 className="size-8 animate-spin text-accent" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  )
}

export function Skeleton({ className = 'h-16' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-2xl bg-surface-2 ${className}`} />
}

export function SkeletonList({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className="space-y-3" role="status" aria-label="Cargando">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className={className} />
      ))}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-4 grid size-16 place-items-center rounded-full bg-brand-blue/15 text-accent">{icon}</div>}
      <h2 className="text-xl font-semibold">{title}</h2>
      {children && <div className="mt-2 max-w-xs text-muted">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid size-16 place-items-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle className="size-8" aria-hidden />
      </div>
      <h2 className="text-xl font-semibold">Algo ha fallado</h2>
      <p className="mt-2 max-w-xs text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry} icon={<RotateCw className="size-4" />}>
          Reintentar
        </Button>
      )}
    </div>
  )
}
