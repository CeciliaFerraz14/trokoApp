// Android/Chrome lanza `beforeinstallprompt` muy pronto, antes de que React
// monte nada: lo capturamos al cargar el módulo y lo guardamos aquí.
import { useSyncExternalStore } from 'react'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export function useInstallPrompt() {
  const event = useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => deferred,
    () => null,
  )
  return {
    canPrompt: !!event,
    async prompt() {
      if (!event) return false
      await event.prompt()
      const { outcome } = await event.userChoice
      deferred = null
      emit()
      return outcome === 'accepted'
    },
  }
}
