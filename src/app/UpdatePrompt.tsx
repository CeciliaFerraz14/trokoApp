import { useRegisterSW } from 'virtual:pwa-register/react'
import { RefreshCw } from 'lucide-react'

const HOUR = 60 * 60 * 1000

/** Aviso "Hay una actualización" cuando se despliega una versión nueva */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Las apps instaladas pueden estar días abiertas: comprobar cada hora
      if (registration) setInterval(() => void registration.update(), HOUR)
    },
  })

  if (!needRefresh) return null

  return (
    <button
      onClick={() => updateServiceWorker(true)}
      className="fixed inset-x-4 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-brand-blue p-4 text-left text-brand-black shadow-2xl"
    >
      <RefreshCw className="size-6 shrink-0" />
      <span className="flex-1">
        <strong className="block font-display text-lg">Hay una actualización</strong>
        <span className="text-sm">Toca aquí para recargar la app.</span>
      </span>
    </button>
  )
}
