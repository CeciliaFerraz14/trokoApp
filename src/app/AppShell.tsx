import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Spinner } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { usePendingUsers } from '@/features/admin/api'
import { useUnreadCount } from '@/features/announcements/api'
import { TabBar } from './TabBar'
import { OfflineBanner } from './OfflineBanner'
import { UpdatePrompt } from './UpdatePrompt'

export function AppShell() {
  const { data: me } = useMe()
  const isAdmin = !!me?.isAdmin
  const pending = usePendingUsers({ enabled: isAdmin })
  const unread = useUnreadCount()

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Espacio inferior = altura de la barra + safe area */}
      <main className="flex-1 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)]">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <OfflineBanner />
      <TabBar isAdmin={isAdmin} pendingCount={pending.data?.length ?? 0} unreadCount={unread} />
      <UpdatePrompt />
    </div>
  )
}
