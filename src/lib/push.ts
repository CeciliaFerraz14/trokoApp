// Notificaciones push (Web Push). Cada dispositivo se suscribe por su cuenta:
// el navegador da una "suscripción" que se guarda en Supabase y a la que
// /api/push envía los avisos.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { isIOS, isStandalone } from '@/lib/platform'

export type PushState =
  | 'unsupported' // navegador sin push
  | 'ios-install' // iPhone: solo con la app instalada en la pantalla de inicio
  | 'denied' // la persona las bloqueó en los ajustes
  | 'off'
  | 'on'

export const pushSupported = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration()
  return (await reg?.pushManager.getSubscription()) ?? null
}

function base64UrlToBytes(value: string) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string) {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

async function detect(): Promise<PushState> {
  if (isIOS && !isStandalone()) return 'ios-install'
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const sub = await currentSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

/** Pide permiso, suscribe este dispositivo y lo guarda en Supabase */
async function enable() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error(permission === 'denied' ? 'Has bloqueado las notificaciones' : 'No se han activado')
  const reg = await withTimeout(navigator.serviceWorker.ready, 10_000, 'La app aún se está preparando. Vuelve a intentarlo en un momento.')
  const { data: key, error } = await supabase.rpc('push_public_key')
  if (error) throw error
  if (!key) throw new Error('Las notificaciones aún no están configuradas')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    // Sin conexión con el servicio de avisos del navegador, subscribe() puede no responder nunca
    (await withTimeout(
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) }),
      20_000,
      'No se han podido activar. Comprueba la conexión y vuelve a intentarlo.',
    ))
  const json = sub.toJSON()
  const { error: e2 } = await supabase.rpc('save_push_subscription', {
    p_endpoint: sub.endpoint,
    p_p256dh: json.keys?.p256dh ?? '',
    p_auth: json.keys?.auth ?? '',
    p_user_agent: navigator.userAgent,
  })
  if (e2) throw e2
}

/** Quita la suscripción de este dispositivo (también al cerrar sesión) */
export async function disable() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.rpc('delete_push_subscription', { p_endpoint: sub.endpoint })
  await sub.unsubscribe()
}

/** Estado de las notificaciones en este dispositivo y acciones para cambiarlo */
export function usePush() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void detect().then(setState)
  }, [])

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    try {
      await fn()
    } finally {
      setBusy(false)
      setState(await detect())
    }
  }, [])

  return { state, busy, enable: () => run(enable), disable: () => run(disable) }
}
