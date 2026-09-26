import { Copy, RefreshCw, Share2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { useInviteCode, useRegenerateCode } from '@/features/admin/api'

/** Código de invitación del grupo. Admin y coordinación lo ven y comparten; solo un admin lo regenera */
export function InviteCodeCard({ groupId, groupName, canRegenerate = false }: { groupId: string; groupName: string; canRegenerate?: boolean }) {
  const code = useInviteCode(groupId)
  const regenerate = useRegenerateCode()
  const toast = useToast()
  const value = code.data?.code

  const message = `¡Únete a ${groupName} en la app de Troko Bloco! Regístrate en ${location.origin}/registro con el código ${value}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value ?? '')
      toast('Código copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
  const share = () => navigator.share?.({ title: 'Troko Bloco', text: message }).catch(() => {})

  return (
    <section>
      <SectionTitle>Código de invitación</SectionTitle>
      <Card className="space-y-3 text-center">
        <p className="font-mono text-4xl font-bold tracking-[0.3em] text-accent">{value ?? '······'}</p>
        <p className="text-sm text-muted">
          Quien se registre con este código entra directamente en <strong>{groupName}</strong> sin esperar aprobación.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copy} icon={<Copy className="size-4" />} disabled={!value}>
            Copiar
          </Button>
          {'share' in navigator && (
            <Button variant="secondary" className="flex-1" onClick={share} icon={<Share2 className="size-4" />} disabled={!value}>
              Compartir
            </Button>
          )}
        </div>
        {canRegenerate && (
          <Button
            variant="ghost"
            block
            loading={regenerate.isPending}
            icon={<RefreshCw className="size-4" />}
            onClick={() =>
              confirm('¿Generar un código nuevo? El anterior dejará de funcionar.') &&
              regenerate.mutate(groupId, { onSuccess: () => toast('Código regenerado'), onError: (e) => toast(errorMessage(e), 'error') })
            }
          >
            Regenerar código
          </Button>
        )}
      </Card>
    </section>
  )
}
