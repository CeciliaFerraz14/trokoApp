import { Copy, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

/**
 * Invitar a alguien a la app: comparte el enlace de registro. La cuenta la
 * aprueba un admin y después pide entrar en el grupo (no hay códigos).
 */
export function InviteCard({ groupName }: { groupName: string }) {
  const toast = useToast()
  const link = `${location.origin}/registro`
  const message = `¡Únete a ${groupName} en la app de Troko Bloco! Crea tu cuenta en ${link} y, cuando te aprueben, pide entrar en ${groupName}.`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message)
      toast('Invitación copiada')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
  const share = () => navigator.share?.({ title: 'Troko Bloco', text: message }).catch(() => {})

  return (
    <section>
      <SectionTitle>Invitar a la app</SectionTitle>
      <Card className="space-y-3">
        <p className="text-sm text-muted">
          Comparte el enlace para crear cuenta. Un admin la aprobará y después podrá pedir entrar en <strong className="text-fg">{groupName}</strong>.
        </p>
        <p className="truncate rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm text-accent">{link}</p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copy} icon={<Copy className="size-4" />}>
            Copiar
          </Button>
          {'share' in navigator && (
            <Button variant="secondary" className="flex-1" onClick={share} icon={<Share2 className="size-4" />}>
              Compartir
            </Button>
          )}
        </div>
      </Card>
    </section>
  )
}
