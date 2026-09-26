import { useEffect, useState, type FormEvent } from 'react'
import { Clock, LogOut, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { AuthLayout } from './AuthLayout'
import { signOut } from './AuthProvider'
import type { Profile } from '@/types/database'

export function PendingPage({ profile }: { profile: Profile }) {
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const rejected = profile.status === 'rejected'

  // Comprueba cada 20 s si ya la han aprobado
  useEffect(() => {
    if (rejected) return
    const id = setInterval(() => queryClient.invalidateQueries({ queryKey: ['me'] }), 20_000)
    return () => clearInterval(id)
  }, [rejected])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.rpc('join_with_code', { p_code: code })
    setLoading(false)
    if (error) setError(errorMessage(error))
    else await queryClient.invalidateQueries({ queryKey: ['me'] })
  }

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
            : 'Tu cuenta está pendiente de aprobación. En cuanto un admin la acepte y te asigne tus grupos podrás entrar. Esta pantalla se actualiza sola.'}
        </p>
      </div>

      {!rejected && (
        <form onSubmit={onSubmit} className="mt-8 space-y-3 rounded-2xl border border-white/15 p-4">
          <p className="text-sm font-semibold text-white/80">¿Tienes un código de invitación de tu grupo?</p>
          <TextField
            label="Código"
            autoCapitalize="characters"
            autoComplete="off"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="[&_input]:font-mono [&_input]:tracking-widest [&_input]:uppercase"
          />
          <FormError>{error}</FormError>
          <Button type="submit" block loading={loading} disabled={code.trim().length < 4}>
            Usar código
          </Button>
        </form>
      )}

      <Button variant="ghost" className="mx-auto mt-6 flex" icon={<LogOut className="size-4" />} onClick={() => signOut()}>
        Cerrar sesión
      </Button>
    </AuthLayout>
  )
}
