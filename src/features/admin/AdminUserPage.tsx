import { useParams } from 'react-router'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Ban, Check, RotateCcw } from 'lucide-react'
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
import type { GroupRole } from '@/types/database'
import { useAllUsers, useSetMembership, useUpdateUserAccount, useUserEmails } from './api'

const statusLabel = { active: 'Activa', pending: 'Pendiente', rejected: 'Rechazada' } as const
const statusTone = { active: 'success', pending: 'warning', rejected: 'danger' } as const

export function AdminUserPage() {
  const { id } = useParams()
  const { data: me } = useMe()
  const users = useAllUsers()
  const groups = useGroups()
  const emails = useUserEmails()
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
      </Page>
    </>
  )
}
