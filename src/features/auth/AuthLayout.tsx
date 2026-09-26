import type { ReactNode } from 'react'
import { TribalPattern } from '@/components/ui/TribalPattern'

/** Pantallas sin sesión: fondo negro con el logotipo completo */
export function AuthLayout({ children, title }: { children: ReactNode; title?: string }) {
  return (
    // Siempre en oscuro (el logo es para fondo negro); isolate para que el motivo quede detrás del contenido
    <div data-theme="dark" className="relative isolate flex min-h-dvh flex-col bg-brand-black pt-safe pb-safe text-white">
      <TribalPattern className="absolute inset-0 opacity-60" />
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-5 py-6">
        {/* Panel oscuro redondeado con el logo, como en la propuesta B */}
        <div className="mb-6 rounded-[2.25rem] bg-surface px-6 pt-8 pb-7 text-center">
          <img src="/logo-troko-bloco.png" alt="Troko Bloco" className="mx-auto w-48 max-w-[70%]" />
          {title && <h1 className="mt-5 font-display text-3xl leading-tight font-bold">{title}</h1>}
        </div>
        {children}
      </div>
    </div>
  )
}
