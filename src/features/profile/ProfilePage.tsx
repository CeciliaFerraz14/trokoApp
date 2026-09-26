import { Link } from 'react-router'
import { CalendarSync, ChevronRight, KeyRound, LogOut, Moon, Pencil, Smartphone, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Spinner } from '@/components/ui/States'
import { signOut } from '@/features/auth/AuthProvider'
import { useMe } from '@/features/auth/useMe'

export function ProfilePage() {
  const { data: me } = useMe()
  const [theme, setTheme] = useTheme()
  if (!me) return <Spinner />
  const { profile, memberships } = me

  return (
    <>
      <PageHeader
        title="Perfil"
        actions={
          <Link to="/perfil/editar" aria-label="Editar perfil" className="grid size-11 place-items-center rounded-full hover:bg-white/10">
            <Pencil className="size-5" />
          </Link>
        }
      />
      <Page className="space-y-6">
        <div className="flex flex-col items-center pt-2 text-center">
          <Avatar name={profile.full_name} url={profile.avatar_url} size="xl" />
          <h2 className="mt-3 text-2xl font-bold">{profile.nickname || profile.full_name}</h2>
          {profile.nickname && <p className="text-muted">{profile.full_name}</p>}
          {me.isAdmin && <Badge tone="brand" className="mt-2">Admin</Badge>}
          {profile.instruments.length > 0 && (
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {profile.instruments.map((i) => (
                <Badge key={i}>🥁 {i}</Badge>
              ))}
            </div>
          )}
        </div>

        <section>
          <SectionTitle>Mis grupos</SectionTitle>
          {memberships.length === 0 ? (
            <Card className="text-muted">Todavía no estás en ningún grupo. Un admin te asignará los tuyos.</Card>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {memberships.map(({ group, role }) => (
                <li key={group.id}>
                  <Link to={`/muro/${group.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface-2">
                    <GroupDot color={group.color} className="size-4" />
                    <span className="flex-1 font-semibold">{group.name}</span>
                    {role === 'coordinator' && <Badge tone="brand">Coordina</Badge>}
                    <ChevronRight className="size-5 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Ajustes</SectionTitle>
          <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-surface-2"
            >
              {theme === 'dark' ? <Moon className="size-5 text-accent" /> : <Sun className="size-5 text-accent" />}
              <span className="flex-1 font-semibold">Tema</span>
              <span className="text-muted">{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
            </button>
            <Link to="/perfil/contrasena" className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <KeyRound className="size-5 text-accent" />
              <span className="flex-1 font-semibold">Cambiar contraseña</span>
              <ChevronRight className="size-5 text-muted" />
            </Link>
            <Link to="/calendario/suscribirse" className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <CalendarSync className="size-5 text-accent" />
              <span className="flex-1 font-semibold">Calendario en el móvil</span>
              <ChevronRight className="size-5 text-muted" />
            </Link>
            <Link to="/instalar" className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <Smartphone className="size-5 text-accent" />
              <span className="flex-1 font-semibold">Cómo instalar la app</span>
              <ChevronRight className="size-5 text-muted" />
            </Link>
          </div>
        </section>

        <Button variant="danger" block icon={<LogOut className="size-4" />} onClick={() => signOut()}>
          Cerrar sesión
        </Button>
      </Page>
    </>
  )
}
