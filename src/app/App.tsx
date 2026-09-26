import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { AnnouncementsPage } from '@/features/announcements/AnnouncementsPage'
import { AnnouncementDetailPage } from '@/features/announcements/AnnouncementDetailPage'
import { AnnouncementFormPage } from '@/features/announcements/AnnouncementFormPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { EventDetailPage } from '@/features/calendar/EventDetailPage'
import { EventFormPage } from '@/features/calendar/EventFormPage'
import { SubscribePage } from '@/features/calendar/SubscribePage'
import { MyGroupsPage } from '@/features/groups/MyGroupsPage'
import { GroupPage } from '@/features/groups/GroupPage'
import { ComposerPage } from '@/features/wall/ComposerPage'
import { PostPage } from '@/features/wall/PostPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { EditProfilePage } from '@/features/profile/EditProfilePage'
import { ChangePasswordPage } from '@/features/profile/ChangePasswordPage'
import { InstallPage } from '@/features/install/InstallPage'
import { EmptyState } from '@/components/ui/States'
import { AppShell } from './AppShell'
import { PublicOnly, RequireActive, RequireAdmin } from './guards'
import { Splash } from './Splash'

// El panel de admin solo lo usan unas pocas personas: se carga aparte
const AdminPage = lazy(() => import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUserPage = lazy(() => import('@/features/admin/AdminUserPage').then((m) => ({ default: m.AdminUserPage })))
const AdminGroupPage = lazy(() => import('@/features/admin/AdminGroupPage').then((m) => ({ default: m.AdminGroupPage })))

export function App() {
  const { loading } = useAuth()
  if (loading) return <Splash />

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegisterPage />} />
        </Route>

        {/* Accesible con o sin sesión */}
        <Route path="/instalar" element={<InstallPage />} />

        <Route element={<RequireActive />}>
          <Route element={<AppShell />}>
            <Route index element={<Navigate to="/avisos" replace />} />
            <Route path="/avisos" element={<AnnouncementsPage />} />
            <Route path="/avisos/nuevo" element={<AnnouncementFormPage />} />
            <Route path="/avisos/:id" element={<AnnouncementDetailPage />} />
            <Route path="/avisos/:id/editar" element={<AnnouncementFormPage />} />
            <Route path="/calendario" element={<CalendarPage />} />
            <Route path="/calendario/nuevo" element={<EventFormPage />} />
            <Route path="/calendario/suscribirse" element={<SubscribePage />} />
            <Route path="/calendario/:id" element={<EventDetailPage />} />
            <Route path="/calendario/:id/editar" element={<EventFormPage />} />
            <Route path="/muro" element={<MyGroupsPage />} />
            <Route path="/muro/:groupId" element={<GroupPage />} />
            <Route path="/muro/:groupId/nueva" element={<ComposerPage />} />
            <Route path="/muro/:groupId/p/:postId" element={<PostPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/perfil/editar" element={<EditProfilePage />} />
            <Route path="/perfil/contrasena" element={<ChangePasswordPage />} />

            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin/personas/:id" element={<AdminUserPage />} />
              <Route path="/admin/grupos/nuevo" element={<AdminGroupPage />} />
              <Route path="/admin/grupos/:id" element={<AdminGroupPage />} />
            </Route>

            <Route path="*" element={<EmptyState title="Página no encontrada">Esta pantalla no existe.</EmptyState>} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
