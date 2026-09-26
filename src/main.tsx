import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import '@/lib/installPrompt' // captura beforeinstallprompt lo antes posible
import { isSupabaseConfigured } from '@/lib/supabase'
import { PERSIST_MAX_AGE, persister, queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ToastProvider } from '@/components/ui/Toast'
import { App } from '@/app/App'
import { SetupNeeded } from '@/app/SetupNeeded'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <PersistQueryClientProvider client={queryClient} persistOptions={{ persister, maxAge: PERSIST_MAX_AGE, buster: 'v1' }}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </PersistQueryClientProvider>
    ) : (
      <SetupNeeded />
    )}
  </StrictMode>,
)
