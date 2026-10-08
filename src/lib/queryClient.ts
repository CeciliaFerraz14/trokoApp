import { QueryClient } from '@tanstack/react-query'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { del, get, set } from 'idb-keyval'

const WEEK = 1000 * 60 * 60 * 24 * 7

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      // Debe ser >= maxAge del persister para que lo guardado sobreviva
      gcTime: WEEK,
      retry: (count, error) => count < 2 && !(error instanceof Error && /permission|JWT/i.test(error.message)),
      // Sin conexión se muestran los últimos datos guardados
      networkMode: 'offlineFirst',
    },
    mutations: { networkMode: 'online' },
  },
})

/** Guarda la caché de consultas en IndexedDB para poder ver lo último sin conexión */
export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key).then((v) => v ?? null),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'troko-query-cache',
  throttleTime: 2000,
})

export const PERSIST_MAX_AGE = WEEK

/**
 * Versión de la copia guardada: al cambiarla, la app descarta la copia vieja al
 * actualizarse. Subirla cuando cambie la forma de algún dato guardado.
 * v2: los emails de admin y las solicitudes de grupo se guardaban como Map (se perdían).
 * v3: los avisos llevan fotos y enlace.
 */
export const PERSIST_BUSTER = 'v4'

/** Al cerrar sesión: borrar todo lo guardado para que no lo vea otra persona */
export async function clearCachedData() {
  queryClient.clear()
  await persister.removeClient()
  // Fotos privadas del muro guardadas por el service worker
  if ('caches' in window) await caches.delete('wall-photos')
}
