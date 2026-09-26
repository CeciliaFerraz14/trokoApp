import { WifiOff } from 'lucide-react'
import { useOnline } from '@/lib/useOnline'

/** Píldora flotante sobre la barra inferior cuando no hay conexión */
export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4"
    >
      <span className="flex items-center gap-2 rounded-full bg-warning px-4 py-2 text-sm font-bold text-black shadow-lg">
        <WifiOff className="size-4" /> Sin conexión · viendo lo último guardado
      </span>
    </div>
  )
}
