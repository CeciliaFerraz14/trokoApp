import { cn } from '@/lib/cn'

/**
 * Fondo decorativo con motivos de percusión. Va detrás de todo (-z-10): el
 * contenedor que lo use no debe pintar un fondo propio encima, o crear su
 * propio contexto de apilamiento (isolate) como hace AuthLayout.
 */
export function TribalPattern({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('pointer-events-none -z-10', className)}>
      <div className="pattern-lines" />
      <div className="pattern-drums" />
    </div>
  )
}
