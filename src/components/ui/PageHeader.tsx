import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, useNavigate, type LinkProps } from 'react-router'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/cn'

interface Props {
  title: string
  subtitle?: ReactNode
  /** Muestra el botón de volver */
  back?: boolean | string
  /** En lugar del botón de volver (p. ej. el avatar en Avisos) */
  leading?: ReactNode
  actions?: ReactNode
  /** Contenido extra dentro del bloque azul (tarjetas, cifras…). Con él, la cabecera no se queda fija al hacer scroll */
  children?: ReactNode
}

// Botón redondo negro con icono azul: el estilo de las acciones sobre la cabecera azul
const actionClass =
  'grid size-11 shrink-0 place-items-center rounded-full bg-brand-black text-brand-blue transition-colors hover:bg-black/75 disabled:opacity-50'

/** Cabecera de pantalla: bloque azul con esquinas inferiores redondeadas */
export function PageHeader({ title, subtitle, back, leading, actions, children }: Props) {
  const navigate = useNavigate()
  return (
    <header
      className={cn(
        'z-20 rounded-b-[2rem] bg-brand-blue pt-safe text-brand-black shadow-lg shadow-black/25',
        !children && 'sticky top-0',
      )}
    >
      <div className="mx-auto flex min-h-16 max-w-lg items-center gap-3 px-4 py-2">
        {back ? (
          <HeaderButton label="Volver" onClick={() => goBack(navigate, back)}>
            <ChevronLeft className="size-6" />
          </HeaderButton>
        ) : (
          leading
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl leading-tight font-bold">{title}</h1>
          {subtitle && <div className="truncate text-sm font-semibold text-black/75">{subtitle}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
        {/* Logo de Troko Bloco en la esquina, en negro (el original es azul y no se vería sobre la cabecera) */}
        <span aria-hidden className="logo-mark h-11 w-16 shrink-0" />
      </div>
      {/* empty:hidden: si el contenido no pinta nada (p. ej. sin próximo evento), no deja hueco */}
      {children && <div className="mx-auto max-w-lg px-4 pb-5 empty:hidden">{children}</div>}
    </header>
  )
}

/**
 * Vuelve a la pantalla anterior. Si la app se abrió directamente aquí (p. ej.
 * desde una notificación) no hay a dónde volver: sube a la pantalla padre.
 */
function goBack(navigate: ReturnType<typeof useNavigate>, back: true | string) {
  if (typeof back === 'string') navigate(back)
  else if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1)
  else navigate('..', { relative: 'path' })
}

/** Acción de la cabecera como botón */
export function HeaderButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} className={cn(actionClass, className)} {...rest}>
      {children}
    </button>
  )
}

/** Acción de la cabecera como enlace */
export function HeaderLink({ label, className, children, ...rest }: LinkProps & { label: string }) {
  return (
    <Link aria-label={label} title={label} className={cn(actionClass, className)} {...rest}>
      {children}
    </Link>
  )
}

/** Contenedor de página: columna centrada con márgenes laterales */
export function Page({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-lg px-safe py-5 ${className}`}>{children}</div>
}
