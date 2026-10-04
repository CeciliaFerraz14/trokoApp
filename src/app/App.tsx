import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { AnnouncementsPage } from '@/features/announcements/AnnouncementsPage'
import { AnnouncementDetailPage } from '@/features/announcements/AnnouncementDetailPage'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { EventDetailPage } from '@/features/calendar/EventDetailPage'
import { MyGroupsPage } from '@/features/groups/MyGroupsPage'
import { GroupPage } from '@/features/groups/GroupPage'
import { ProfilePage } from '@/features/profile/ProfilePage'
import { EditProfilePage } from '@/features/profile/EditProfilePage'
import { ChangePasswordPage } from '@/features/profile/ChangePasswordPage'
import { PrivacyPage } from '@/features/profile/PrivacyPage'
import { TrokotecaPage } from '@/features/trokoteca/TrokotecaPage'
import { InstallPage } from '@/features/install/InstallPage'
import { EmptyState } from '@/components/ui/States'
import { AppShell } from './AppShell'
import { PublicOnly, RequireActive, RequireAdmin } from './guards'
import { Splash } from './Splash'
import { UpdatePrompt } from './UpdatePrompt'
import { TribalPattern } from '@/components/ui/TribalPattern'

// Pantallas secundarias (formularios, detalle de publicación…): se cargan al abrirlas
const AnnouncementFormPage = lazy(() => import('@/features/announcements/AnnouncementFormPage').then((m) => ({ default: m.AnnouncementFormPage })))
const EventFormPage = lazy(() => import('@/features/calendar/EventFormPage').then((m) => ({ default: m.EventFormPage })))
const ComposerPage = lazy(() => import('@/features/wall/ComposerPage').then((m) => ({ default: m.ComposerPage })))
const PostPage = lazy(() => import('@/features/wall/PostPage').then((m) => ({ default: m.PostPage })))
const GuidePage = lazy(() => import('@/features/trokoteca/GuidePage').then((m) => ({ default: m.GuidePage })))
const LibraryItemFormPage = lazy(() => import('@/features/trokoteca/LibraryItemFormPage').then((m) => ({ default: m.LibraryItemFormPage })))
const ProductPage = lazy(() => import('@/features/trokoteca/ProductPage').then((m) => ({ default: m.ProductPage })))
const ProductFormPage = lazy(() => import('@/features/trokoteca/ProductFormPage').then((m) => ({ default: m.ProductFormPage })))
const OrdersPage = lazy(() => import('@/features/trokoteca/OrdersPage').then((m) => ({ default: m.OrdersPage })))

// El panel de admin solo lo usan unas pocas personas: se carga aparte
const AdminPage = lazy(() => import('@/features/admin/AdminPage').then((m) => ({ default: m.AdminPage })))
const AdminUserPage = lazy(() => import('@/features/admin/AdminUserPage').then((m) => ({ default: m.AdminUserPage })))
const AdminGroupPage = lazy(() => import('@/features/admin/AdminGroupPage').then((m) => ({ default: m.AdminGroupPage })))

export function App() {
  const { loading } = useAuth()
  if (loading) return <Splash />

  return (
    <BrowserRouter>
      {/* En todas las pantallas (también login e instalar): registra el service
          worker para el modo sin conexión y avisa de versiones nuevas */}
      <UpdatePrompt />
      <TribalPattern className="fixed inset-0" />
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
            <Route path="/calendario/:id" element={<EventDetailPage />} />
            <Route path="/calendario/:id/editar" element={<EventFormPage />} />
            <Route path="/muro" element={<MyGroupsPage />} />
            <Route path="/muro/:groupId" element={<GroupPage />} />
            <Route path="/muro/:groupId/nueva" element={<ComposerPage />} />
            <Route path="/muro/:groupId/p/:postId" element={<PostPage />} />
            <Route path="/trokoteca" element={<TrokotecaPage />} />
            <Route path="/trokoteca/nuevo" element={<LibraryItemFormPage />} />
            <Route path="/trokoteca/pedidos" element={<OrdersPage />} />
            <Route path="/trokoteca/merch/nuevo" element={<ProductFormPage />} />
            <Route path="/trokoteca/merch/:id" element={<ProductPage />} />
            <Route path="/trokoteca/merch/:id/editar" element={<ProductFormPage />} />
            <Route path="/trokoteca/:id" element={<GuidePage />} />
            <Route path="/trokoteca/:id/editar" element={<LibraryItemFormPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/perfil/editar" element={<EditProfilePage />} />
            <Route path="/perfil/contrasena" element={<ChangePasswordPage />} />
            <Route path="/perfil/privacidad" element={<PrivacyPage />} />

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
