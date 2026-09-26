import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { AuthLayout } from './AuthLayout'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setLoading(false)
    if (error) setError(errorMessage(error))
    // Si va bien, AuthProvider recibe la sesión y las rutas redirigen solas
  }

  return (
    <AuthLayout title="¡Hola de nuevo!">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" block loading={loading} disabled={!email || !password} className="min-h-14 text-lg">
          Entrar
        </Button>
      </form>

      <p className="mt-8 mb-2 text-center text-white/70">¿Primera vez por aquí?</p>
      <Link to="/registro" className="flex min-h-14 items-center justify-center rounded-full border-2 border-brand-blue font-display text-lg font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10">
        Crear cuenta
      </Link>
      <p className="mt-6 text-center text-sm text-white/60">
        ¿Has olvidado la contraseña? Pide a la organización que te la restablezca.
      </p>
      <p className="mt-4 text-center">
        <Link to="/instalar" className="inline-block min-h-11 py-2.5 text-sm font-semibold text-brand-blue">
          Cómo instalar la app en tu móvil
        </Link>
      </p>
    </AuthLayout>
  )
}
