import type { ReactNode } from 'react'
import { TribalPattern } from '@/components/ui/TribalPattern'

/** Pantallas sin sesión: fondo negro con el logotipo completo */
export function AuthLayout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    // Siempre en oscuro (el logo es para fondo negro); isolate para que el motivo quede detrás del contenido
    <div data-theme="dark" className="relative isolate flex min-h-dvh flex-col bg-brand-black pt-safe pb-safe text-white">
      <TribalPattern className="absolute inset-0 opacity-60" />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-6 py-8">
        <img
          src="/logo-troko-bloco.png"
          alt="Troko Bloco"
          className="mx-auto mb-8 w-56 max-w-[70%]"
        />
        {title && <h1 className="mb-6 text-center font-display text-3xl font-bold">{title}</h1>}
        {children}
      </div>
    </div>
  )
}
