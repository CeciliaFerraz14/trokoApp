import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { clearCachedData, queryClient } from '@/lib/queryClient'
import { disable as disablePush } from '@/lib/push'

interface AuthState {
  session: Session | null
  /** true mientras se recupera la sesión guardada al abrir la app */
  loading: boolean
}

const AuthContext = createContext<AuthState>({ session: null, loading: true })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setState({ session: data.session, loading: false }))

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, loading: false })
      if (event === 'SIGNED_OUT') void clearCachedData()
      if (event === 'SIGNED_IN') void queryClient.invalidateQueries({ queryKey: ['me'] })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

export async function signOut() {
  // Este dispositivo deja de recibir los avisos de esta cuenta
  await disablePush().catch(() => {})
  await supabase.auth.signOut()
  await clearCachedData()
}
