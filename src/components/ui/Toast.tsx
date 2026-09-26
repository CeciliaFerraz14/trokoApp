import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, XCircle } from 'lucide-react'

type Tone = 'success' | 'error'
interface ToastItem { id: number; text: string; tone: Tone }

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const show = useCallback((text: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random()
    setItems((prev) => [...prev, { id, text, tone }])
    setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className="flex max-w-sm items-center gap-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-semibold text-fg shadow-xl"
          >
            {t.tone === 'success' ? (
              <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
            ) : (
              <XCircle className="size-5 shrink-0 text-danger" aria-hidden />
            )}
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
