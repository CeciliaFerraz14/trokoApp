import { useState } from 'react'
import { Link } from 'react-router'
import { ChevronRight, KeyRound, Loader2, Trash2, LogOut, Moon, Pencil, ShieldCheck, Smartphone, Sun, Type } from 'lucide-react'
import { useTheme } from '@/lib/theme'
import { FONT_SIZES, useFontSize } from '@/lib/fontSize'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { HeaderLink, Page, PageHeader } from '@/components/ui/PageHeader'
import { PushSettingRow } from '@/components/ui/PushToggle'
import { Spinner } from '@/components/ui/States'
import { signOut } from '@/features/auth/AuthProvider'
import { useMe } from '@/features/auth/useMe'
import { deleteAccount } from '@/features/admin/api'
import { useToast } from '@/components/ui/Toast'
import { errorMessage } from '@/lib/errors'

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
          <HeaderLink to="/perfil/editar" label="Editar perfil">
            <Pencil className="size-5" />
          </HeaderLink>
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
            <PushSettingRow />
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="flex min-h-14 w-full items-center gap-3 px-4 text-left hover:bg-surface-2"
            >
              {theme === 'dark' ? <Moon className="size-5 text-accent" /> : <Sun className="size-5 text-accent" />}
              <span className="flex-1 font-semibold">Tema</span>
              <span className="text-muted">{theme === 'dark' ? 'Oscuro' : 'Claro'}</span>
            </button>
            <FontSizeRow />
            <Link to="/perfil/contrasena" className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <KeyRound className="size-5 text-accent" />
              <span className="flex-1 font-semibold">Cambiar contraseña</span>
              <ChevronRight className="size-5 text-muted" />
            </Link>
            <Link to="/perfil/privacidad" className="flex min-h-14 items-center gap-3 px-4 hover:bg-surface-2">
              <ShieldCheck className="size-5 text-accent" />
              <span className="flex-1 font-semibold">Privacidad</span>
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

        <DeleteMyAccount userId={profile.id} />
      </Page>
    </>
  )
}

/** Tamaño de letra: cuatro botones "A" de menor a mayor */
function FontSizeRow() {
  const [size, setSize] = useFontSize()
  return (
    <div className="space-y-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <Type className="size-5 text-accent" />
        <span className="flex-1 font-semibold">Tamaño de letra</span>
        <span className="text-muted">{FONT_SIZES.find((s) => s.value === size)?.label}</span>
      </div>
      <div role="radiogroup" aria-label="Tamaño de letra" className="grid grid-cols-4 gap-2">
        {FONT_SIZES.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={size === s.value}
            aria-label={s.label}
            onClick={() => setSize(s.value)}
            className={cn(
              'flex h-12 items-center justify-center rounded-xl font-display font-semibold transition-colors',
              size === s.value ? 'bg-fg text-bg' : 'bg-surface-2 hover:bg-line',
            )}
          >
            {/* En px: el botón enseña el tamaño real aunque cambie la escala de la app */}
            <span style={{ fontSize: `${16 * s.scale}px` }}>A</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function DeleteMyAccount({ userId }: { userId: string }) {
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)

  const onDelete = async () => {
    const answer = prompt(
      'Se borrarán tu cuenta, tu perfil y tus publicaciones, fotos y comentarios del muro. No se puede deshacer.\n\nEscribe BORRAR para confirmar.',
    )
    if (answer?.trim().toUpperCase() !== 'BORRAR') return
    setDeleting(true)
    try {
      await deleteAccount(userId)
      await signOut()
    } catch (e) {
      toast(errorMessage(e), 'error')
      setDeleting(false)
    }
  }

  return (
    <div className="border-t border-line pt-6 text-center">
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        Borrar mi cuenta
      </button>
    </div>
  )
}
