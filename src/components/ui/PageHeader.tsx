import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { IconButton } from './Button'

interface Props {
  title: string
  subtitle?: ReactNode
  /** Muestra el botón de volver */
  back?: boolean | string
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, back, actions }: Props) {
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-chrome/95 pt-safe text-white backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-lg items-center gap-1 px-2">
        {back ? (
          <IconButton
            label="Volver"
            className="text-white"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
          >
            <ChevronLeft className="size-6" />
          </IconButton>
        ) : (
          <span className="w-2" />
        )}
        <div className="min-w-0 flex-1 py-2">
          <h1 className="truncate font-display text-2xl leading-tight font-bold tracking-wide">{title}</h1>
          {subtitle && <div className="truncate text-sm text-white/60">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  )
}

/** Contenedor de página: columna centrada con márgenes laterales */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-lg px-safe py-4 ${className}`}>{children}</div>
}
