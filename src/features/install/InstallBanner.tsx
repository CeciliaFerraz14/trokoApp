import { useState } from 'react'
import { Link } from 'react-router'
import { Download, X } from 'lucide-react'
import { isAndroid, isIOS, isStandalone } from '@/lib/platform'
import { useInstallPrompt } from '@/lib/installPrompt'

const KEY = 'troko-install-dismissed'
const TWO_WEEKS = 1000 * 60 * 60 * 24 * 14

function recentlyDismissed() {
  try {
    return Date.now() - Number(localStorage.getItem(KEY) ?? 0) < TWO_WEEKS
  } catch {
    return false
  }
}

/** Banner discreto que invita a instalar la app (solo en móvil y si no está instalada) */
export function InstallBanner() {
  const { canPrompt, prompt } = useInstallPrompt()
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed())

  if (hidden || !(isIOS || isAndroid || canPrompt)) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()))
    } catch {
      /* ignorar */
    }
    setHidden(true)
  }

  return (
    <div className="px-4 pt-4">
    <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-brand-blue/40 bg-brand-blue/10 p-3">
      <img src="/pwa-64x64.png" alt="" className="size-10 rounded-xl bg-black" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-bold">Instala la app de Troko</p>
        <p className="text-muted">Ábrela desde tu pantalla de inicio, como una app más.</p>
      </div>
      {canPrompt ? (
        <button
          onClick={() => prompt().then((ok) => ok && setHidden(true))}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-brand-blue px-4 font-display font-semibold text-brand-black"
        >
          <Download className="size-4" /> Instalar
        </button>
      ) : (
        <Link to="/instalar" className="inline-flex min-h-11 items-center rounded-full bg-brand-blue px-4 font-display font-semibold text-brand-black">
          Cómo
        </Link>
      )}
      <button onClick={dismiss} aria-label="Cerrar" className="grid size-11 place-items-center rounded-full text-muted hover:text-fg">
        <X className="size-5" />
      </button>
    </div>
    </div>
  )
}
