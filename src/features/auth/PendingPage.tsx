import { useEffect } from 'react'
import { Clock, LogOut, XCircle } from 'lucide-react'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/Button'
import { PushEnableButton } from '@/components/ui/PushToggle'
import { AuthLayout } from './AuthLayout'
import { signOut } from './AuthProvider'
import type { Profile } from '@/types/database'

export function PendingPage({ profile }: { profile: Profile }) {
  const rejected = profile.status === 'rejected'

  // Comprueba cada 20 s si ya la han aprobado
  useEffect(() => {
    if (rejected) return
    const id = setInterval(() => queryClient.invalidateQueries({ queryKey: ['me'] }), 20_000)
    return () => clearInterval(id)
  }, [rejected])

  return (
    <AuthLayout>
      <div className="text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-full bg-brand-blue/15 text-brand-blue">
          {rejected ? <XCircle className="size-8" /> : <Clock className="size-8" />}
        </div>
        <h1 className="font-display text-3xl font-bold">
          {rejected ? 'Cuenta no autorizada' : `¡Hola, ${profile.full_name.split(' ')[0] || 'batuquer@'}!`}
        </h1>
        <p className="mt-3 text-white/75">
          {rejected
            ? 'Tu cuenta no ha sido aprobada. Si crees que es un error, habla con la organización de Troko Bloco.'
            : 'Tu cuenta está pendiente de aprobación. En cuanto un admin la acepte podrás entrar y pedir acceso a tus grupos. Esta pantalla se actualiza sola.'}
        </p>
      </div>

      {!rejected && (
        <div className="mt-8 flex justify-center">
          <PushEnableButton label="Avísame cuando me acepten" />
        </div>
      )}

      <Button variant="ghost" className="mx-auto mt-6 flex" icon={<LogOut className="size-4" />} onClick={() => signOut()}>
        Cerrar sesión
      </Button>
    </AuthLayout>
  )
}
