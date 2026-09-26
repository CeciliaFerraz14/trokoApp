import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { es } from 'date-fns/locale'
import { Check, PartyPopper, X } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useGroups } from '@/features/groups/api'
import type { Group, Profile } from '@/types/database'
import { GroupPicker } from './GroupPicker'
import { useApproveUser, usePendingUsers, useUpdateUserAccount, useUserEmails } from './api'

export function PendingTab() {
  const pending = usePendingUsers()
  const groups = useGroups()
  const emails = useUserEmails()

  if (pending.isPending || groups.isPending) return <SkeletonList count={3} className="h-40" />
  if (pending.isError) return <ErrorState error={pending.error} onRetry={() => pending.refetch()} />
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />

  if (!pending.data.length) {
    return (
      <EmptyState icon={<PartyPopper className="size-8" />} title="Todo al día">
        No hay cuentas esperando aprobación.
      </EmptyState>
    )
  }

  return (
    <div className="space-y-3">
      {pending.data.map((p) => (
        <PendingCard key={p.id} profile={p} email={emails.data?.get(p.id)} groups={groups.data} />
      ))}
    </div>
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
