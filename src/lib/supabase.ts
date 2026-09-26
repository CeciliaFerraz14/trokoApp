import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/** false si faltan las variables de entorno: la app muestra una pantalla de ayuda */
export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'troko-auth',
  },
})
