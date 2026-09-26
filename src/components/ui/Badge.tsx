import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'warning' | 'danger' | 'success'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-muted border-line',
    brand: 'bg-brand-blue/15 text-accent border-brand-blue/40',
    warning: 'bg-warning/15 text-warning border-warning/40',
    danger: 'bg-danger/15 text-danger border-danger/40',
    success: 'bg-success/15 text-success border-success/40',
  }
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold', tones[tone], className)}>
      {children}
    </span>
  )
}

/** Punto de color de un grupo */
export function GroupDot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-3 shrink-0 rounded-full', className)} style={{ backgroundColor: color }} />
}
