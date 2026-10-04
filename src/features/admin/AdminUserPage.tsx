import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AtSign, Ban, Check, Copy, KeyRound, RotateCcw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName, useGroups } from '@/features/groups/api'
import { useInstagramOf } from '@/features/profile/instagram'
import type { GroupRole } from '@/types/database'
import { tempPassword, useAllUsers, useDeleteAccount, useResetPassword, useSetMembership, useUpdateUserAccount, useUserEmails } from './api'

const statusLabel = { active: 'Activa', pending: 'Pendiente', rejected: 'Rechazada' } as const
const statusTone = { active: 'success', pending: 'warning', rejected: 'danger' } as const

export function AdminUserPage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const users = useAllUsers()
  const groups = useGroups()
  const emails = useUserEmails()
  const instagram = useInstagramOf(id)
  const update = useUpdateUserAccount()
  const setMembership = useSetMembership()
  const toast = useToast()

  if (users.isPending || groups.isPending) return <><PageHeader title="Persona" back /><Spinner /></>
  if (users.isError) return <><PageHeader title="Persona" back /><ErrorState error={users.error} onRetry={() => users.refetch()} /></>
  if (groups.isError) return <><PageHeader title="Persona" back /><ErrorState error={groups.error} onRetry={() => groups.refetch()} /></>

  const user = users.data.find((u) => u.id === id)
  if (!user) return <><PageHeader title="Persona" back /><EmptyState title="No encontrada">Esta cuenta no existe.</EmptyState></>

  const isSelf = user.id === me?.profile.id
  const onError = (e: unknown) => toast(errorMessage(e), 'error')
  const roleIn = (groupId: string) => user.memberships.find((m) => m.group_id === groupId)?.role ?? null

  const changeStatus = (status: 'active' | 'rejected') =>
    update.mutate({ userId: user.id, status }, { onSuccess: () => toast(status === 'active' ? 'Cuenta activada' : 'Cuenta desactivada'), onError })

  const changeRole = (role: 'admin' | 'member') => {
    if (role === 'admin' && !confirm(`¿Dar permisos de admin a ${displayName(user)}? Podrá gestionarlo todo.`)) return
    update.mutate({ userId: user.id, role }, { onSuccess: () => toast('Rol actualizado'), onError })
  }

  return (
    <>
      <PageHeader title={displayName(user)} back="/admin?tab=personas" />
      <Page className="space-y-6">
        <Card className="flex items-center gap-4">
          <Avatar name={user.full_name} url={user.avatar_url} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold">{user.full_name || 'Sin nombre'}</p>
            <p className="truncate text-sm text-muted">{emails.data?.get(user.id)}</p>
            {instagram.data && (
              <a
                href={`https://instagram.com/${instagram.data}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 truncate text-sm font-semibold text-accent"
                title="Acepta que le etiqueten en Instagram"
              >
                <AtSign className="size-4 shrink-0" />
                {instagram.data}
              </a>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[user.status]}>{statusLabel[user.status]}</Badge>
              <span className="text-xs text-muted">
                desde {format(new Date(user.approved_at ?? user.created_at), "d 'de' MMMM yyyy", { locale: es })}
              </span>
            </div>
          </div>
        </Card>

        {isSelf && <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">Esta es tu cuenta: no puedes cambiar tu propio rol ni estado.</p>}

        <section>
          <SectionTitle>Rol en la app</SectionTitle>
          <div className="flex gap-2">
            {(['member', 'admin'] as const).map((r) => (
              <button
                key={r}
                disabled={isSelf || update.isPending}
                onClick={() => user.role !== r && changeRole(r)}
                className={cn(
                  'min-h-11 flex-1 rounded-xl border font-display font-semibold disabled:opacity-50',
                  user.role === r ? 'border-brand-blue bg-brand-blue/15 text-accent' : 'border-line text-muted',
                )}
              >
                {r === 'admin' ? 'Admin' : 'Miembro'}
              </button>
            ))}
          </div>
        </section>

        <section>
          <SectionTitle>Grupos</SectionTitle>
          <p className="mb-3 px-1 text-sm text-muted">
            La coordinación permite publicar avisos y eventos y moderar el muro de ese grupo.
          </p>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {groups.data.map((g) => {
              const current = roleIn(g.id)
              const set = (role: GroupRole | null) =>
                current !== role && setMembership.mutate({ userId: user.id, groupId: g.id, role }, { onError })
              return (
                <li key={g.id} className="px-4 py-3">
                  <p className="mb-2 flex items-center gap-2 font-semibold">
                    <GroupDot color={g.color} /> {g.name}
                  </p>
                  <div className="flex gap-1 rounded-full bg-surface-2 p-1 text-sm">
                    {([
                      [null, 'No está'],
                      ['member', 'Miembro'],
                      ['coordinator', 'Coordina'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={label}
                        onClick={() => set(value)}
                        disabled={setMembership.isPending}
                        className={cn(
                          'min-h-10 flex-1 rounded-full font-semibold transition-colors',
                          current !== value
                            ? 'text-muted'
                            : value === null
                              ? 'bg-surface text-fg shadow'
                              : 'bg-brand-blue text-brand-black',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {!isSelf && <ResetPassword userId={user.id} name={displayName(user)} />}

        {!isSelf && (
          <section>
            <SectionTitle>Acceso</SectionTitle>
            {user.status === 'active' ? (
              <Button
                variant="danger"
                block
                icon={<Ban className="size-4" />}
                loading={update.isPending}
                onClick={() => confirm(`¿Quitar el acceso a ${displayName(user)}?`) && changeStatus('rejected')}
              >
                Desactivar cuenta
              </Button>
            ) : (
              <Button
                block
                icon={user.status === 'pending' ? <Check className="size-4" /> : <RotateCcw className="size-4" />}
                loading={update.isPending}
                onClick={() => changeStatus('active')}
              >
                {user.status === 'pending' ? 'Aprobar cuenta' : 'Reactivar cuenta'}
              </Button>
            )}
          </section>
        )}

        {!isSelf && <DeleteAccount userId={user.id} name={displayName(user)} />}
      </Page>
    </>
  )
}

function ResetPassword({ userId, name }: { userId: string; name: string }) {
  const reset = useResetPassword()
  const toast = useToast()
  const [password, setPassword] = useState<string | null>(null)

  const onReset = () => {
    if (!confirm(`¿Poner una contraseña temporal a ${name}? La actual dejará de funcionar.`)) return
    const next = tempPassword()
    reset.mutate({ userId, password: next }, { onSuccess: () => setPassword(next), onError: (e) => toast(errorMessage(e), 'error') })
  }
  const message = password
    ? `Hola ${name}: tu contraseña temporal de la app de Troko Bloco es ${password}. Entra en ${location.origin} y cámbiala en Perfil → Cambiar contraseña.`
    : ''
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast('Mensaje copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }

  return (
    <section>
      <SectionTitle>Contraseña</SectionTitle>
      {password ? (
        <Card className="space-y-3 text-center">
          <p className="text-sm text-muted">Contraseña temporal de {name}:</p>
          <p className="font-mono text-2xl font-bold text-accent select-all">{password}</p>
          <p className="text-sm text-muted">Pásasela por un canal privado. Podrá cambiarla en Perfil → Cambiar contraseña.</p>
          <Button variant="secondary" block icon={<Copy className="size-4" />} onClick={copy}>
            Copiar mensaje
          </Button>
        </Card>
      ) : (
        <Button variant="secondary" block icon={<KeyRound className="size-4" />} loading={reset.isPending} onClick={onReset}>
          Restablecer contraseña
        </Button>
      )}
    </section>
  )
}

function DeleteAccount({ userId, name }: { userId: string; name: string }) {
  const remove = useDeleteAccount()
  const navigate = useNavigate()
  const toast = useToast()

  const onDelete = () => {
    const answer = prompt(
      `Se borrará la cuenta de ${name} con su perfil, sus publicaciones, fotos y comentarios del muro. No se puede deshacer.\n\nEscribe BORRAR para confirmar.`,
    )
    if (answer?.trim().toUpperCase() !== 'BORRAR') return
    remove.mutate(userId, {
      onSuccess: () => {
        toast('Cuenta borrada')
        navigate('/admin?tab=personas', { replace: true })
      },
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  }

  return (
    <section className="border-t border-line pt-6">
      <Button variant="danger" block icon={<Trash2 className="size-4" />} loading={remove.isPending} onClick={onDelete}>
        Borrar cuenta
      </Button>
      <p className="mt-2 px-1 text-sm text-muted">
        Para quitar el acceso sin borrar nada, usa «Desactivar cuenta». Los avisos y eventos que creó se mantienen.
      </p>
    </section>
  )
}
