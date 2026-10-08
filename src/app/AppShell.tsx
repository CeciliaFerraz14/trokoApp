import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import { Spinner } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { useJoinRequests, usePendingUsers } from '@/features/admin/api'
import { useUnreadCount } from '@/features/announcements/api'
import { useWallNews } from '@/features/wall/news'
import { useChatUnreadRealtime, useChatUnreadTotal } from '@/features/chat/unread'
import { cn } from '@/lib/cn'
import { useHideOnScroll, useKeyboardInset } from '@/lib/viewport'
import { ProfileSheetProvider } from '@/features/profile/ProfileSheet'
import { usePollsRealtime } from '@/features/polls/api'
import { TabBar } from './TabBar'
import { OfflineBanner } from './OfflineBanner'
import { ErrorBoundary } from './ErrorBoundary'

export function AppShell() {
  const { data: me } = useMe()
  const isAdmin = !!me?.isAdmin
  const { pathname, search } = useLocation()
  // Dentro del chat de un grupo no hay barra: la caja de escribir va abajo del todo
  const inChat = /^\/muro\/[^/]+$/.test(pathname) && new URLSearchParams(search).get('tab') === 'chat'
  const pending = usePendingUsers({ enabled: isAdmin })
  const requests = useJoinRequests({ enabled: isAdmin })
  const unread = useUnreadCount()
  const wallNews = useWallNews()
  const chatUnread = useChatUnreadTotal()
  useChatUnreadRealtime()
  usePollsRealtime()
  const scrolledDown = useHideOnScroll(pathname)
  const keyboard = useKeyboardInset()
  // iPhone: al cerrar el teclado lo fijo abajo a veces se queda a media pantalla
  // hasta el siguiente scroll; un scroll "en el sitio" lo recoloca
  useEffect(() => {
    if (!keyboard) window.scrollTo(window.scrollX, window.scrollY)
  }, [keyboard])

  return (
    <ProfileSheetProvider>
      <div className="flex min-h-dvh flex-col">
        {/* Espacio inferior = altura de la barra + safe area */}
        <main className={cn('flex-1', inChat ? 'pb-safe' : 'pb-[calc(6rem+env(safe-area-inset-bottom))]')}>
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<Spinner />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
        <OfflineBanner />
        {!inChat && <TabBar isAdmin={isAdmin} pendingCount={(pending.data?.length ?? 0) + (requests.data?.length ?? 0)} unreadCount={unread} wallNews={wallNews.size + chatUnread} hidden={scrolledDown || !!keyboard} />}
      </div>
    </ProfileSheetProvider>
  )
}
