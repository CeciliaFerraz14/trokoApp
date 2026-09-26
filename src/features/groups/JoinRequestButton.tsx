import { Clock, UserPlus, XCircle } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { useCancelRequest, useMyJoinRequests, useRequestAccess } from './api'

/**
 * Pedir entrar en un grupo. Según el estado: "Solicitar acceso", "Solicitud
 * enviada" (con cancelar) o "Rechazada" (con volver a pedirlo).
 */
export function JoinRequestButton({ groupId, groupName, compact = false }: { groupId: string; groupName: string; compact?: boolean }) {
  const requests = useMyJoinRequests()
  const request = useRequestAccess()
  const cancel = useCancelRequest()
  const toast = useToast()
  const status = requests.data?.get(groupId)
  const busy = request.isPending || cancel.isPending

  const ask = () =>
    request.mutate(groupId, {
      onSuccess: () => toast('Solicitud enviada. Un admin la revisará.'),
      onError: (e) => toast(errorMessage(e), 'error'),
    })

  if (status === 'pending') {
    return (
      <div className={compact ? 'flex items-center gap-2' : 'space-y-2 text-center'}>
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent">
          <Clock className="size-4" aria-hidden /> Solicitud enviada
        </p>
        <Button
          variant="ghost"
          className={compact ? 'min-h-9 px-3 text-sm' : undefined}
          loading={cancel.isPending}
          onClick={() =>
            confirm(`¿Cancelar la solicitud para entrar en ${groupName}?`) &&
            cancel.mutate(groupId, { onError: (e) => toast(errorMessage(e), 'error') })
          }
        >
          Cancelar
        </Button>
      </div>
    )
  }

  return (
    <div className={compact ? 'flex items-center gap-2' : 'space-y-2 text-center'}>
      {status === 'rejected' && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-muted">
          <XCircle className="size-4" aria-hidden /> No aceptada
        </p>
      )}
      <Button
        variant={compact ? 'secondary' : 'primary'}
        className={compact ? 'min-h-9 px-3.5 text-sm' : undefined}
        icon={<UserPlus className="size-4" />}
        loading={busy}
        disabled={requests.isPending}
        onClick={ask}
      >
        {status === 'rejected' ? 'Volver a pedirlo' : 'Solicitar acceso'}
      </Button>
    </div>
  )
}
