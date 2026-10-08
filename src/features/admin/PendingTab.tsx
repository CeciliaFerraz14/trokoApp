import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, PartyPopper, X } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { displayName, useGroups } from '@/features/groups/api'
import { GroupDot } from '@/components/ui/Badge'
import type { Group, Profile } from '@/types/database'
import { GroupPicker } from './GroupPicker'
import { useApproveUser, useJoinRequests, usePendingUsers, useResolveJoinRequest, useUpdateUserAccount, useUserEmails, type JoinRequestRow } from './api'

export function PendingTab() {
  const pending = usePendingUsers()
  const requests = useJoinRequests()
  const groups = useGroups()
  const emails = useUserEmails()

  if (pending.isPending || groups.isPending || requests.isPending) return <SkeletonList count={3} className="h-40" />
  if (pending.isError) return <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
  if (requests.isError) return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />

  if (!pending.data.length && !requests.data.length) {
    return (
      <EmptyState icon={<PartyPopper className="size-8" />} title="Todo al día">
        No hay cuentas ni solicitudes esperando.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-6">
      {requests.data.length > 0 && (
        <section>
          <SectionTitle>Quieren entrar en un grupo</SectionTitle>
          <ul className="space-y-3">
            {requests.data.map((r) => (
              <JoinRequestCard key={`${r.group_id}:${r.user_id}`} request={r} />
            ))}
          </ul>
        </section>
      )}
      {pending.data.length > 0 && (
        <section>
          <SectionTitle>Cuentas nuevas</SectionTitle>
          <div className="space-y-3">
            {pending.data.map((p) => (
              <PendingCard key={p.id} profile={p} email={emails.data?.get(p.id)} groups={groups.data} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function JoinRequestCard({ request }: { request: JoinRequestRow }) {
  const resolve = useResolveJoinRequest()
  const toast = useToast()
  const name = request.profile ? displayName(request.profile) : 'Alguien'
  const group = request.group?.name ?? 'un grupo'
  const decide = (accept: boolean) =>
    resolve.mutate(
      { groupId: request.group_id, userId: request.user_id, accept },
      {
        onSuccess: () => toast(accept ? `${name} ya está en ${group}` : 'Solicitud rechazada'),
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    )

  return (
    <li className="flex flex-col gap-3 rounded-[1.4rem] border border-(--card-border) bg-surface p-4">
      <div className="flex items-center gap-3">
        <Avatar name={request.profile?.full_name} url={request.profile?.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          <p className="flex items-center gap-1.5 text-sm text-muted">
            quiere entrar en
            {request.group && <GroupDot color={request.group.color} image={request.group.image} className="size-2.5" />}
            <strong className="text-fg">{group}</strong>
          </p>
          <p className="text-xs text-muted">{formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: es })}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button className="flex-1" icon={<Check className="size-4" />} loading={resolve.isPending && resolve.variables?.accept} disabled={resolve.isPending} onClick={() => decide(true)}>
          Aceptar
        </Button>
        <Button
          variant="secondary"
          className="flex-1"
          icon={<X className="size-4" />}
          loading={resolve.isPending && resolve.variables?.accept === false}
          disabled={resolve.isPending}
          onClick={() => decide(false)}
        >
          Rechazar
        </Button>
      </div>
    </li>
  )
}

function PendingCard({ profile, email, groups }: { profile: Profile; email?: string; groups: Group[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const approve = useApproveUser()
  const update = useUpdateUserAccount()
  const toast = useToast()

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const onApprove = () =>
    approve.mutate(
      { userId: profile.id, groupIds: [...selected] },
      {
        onSuccess: () => toast(`${profile.full_name || 'Cuenta'} aprobada`),
        onError: (e) => toast(errorMessage(e), 'error'),
      },
    )

  const onReject = () => {
    if (!confirm(`¿Rechazar la cuenta de ${profile.full_name || email}?`)) return
    update.mutate(
      { userId: profile.id, status: 'rejected' },
      { onSuccess: () => toast('Cuenta rechazada'), onError: (e) => toast(errorMessage(e), 'error') },
    )
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-3">
        <Avatar name={profile.full_name} url={profile.avatar_url} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{profile.full_name || 'Sin nombre'}</p>
          <p className="truncate text-sm text-muted">{email ?? '…'}</p>
          <p className="text-xs text-muted">
            Se registró {formatDistanceToNow(new Date(profile.created_at), { locale: es, addSuffix: true })}
          </p>
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-muted">Asignar a grupos</p>
        <GroupPicker groups={groups} selected={selected} onToggle={toggle} />
      </div>
      <div className="flex gap-2">
        <Button variant="danger" onClick={onReject} loading={update.isPending} icon={<X className="size-4" />}>
          Rechazar
        </Button>
        <Button className="flex-1" onClick={onApprove} loading={approve.isPending} icon={<Check className="size-4" />}>
          Aprobar{selected.size ? ` (${selected.size})` : ''}
        </Button>
      </div>
    </Card>
  )
}
