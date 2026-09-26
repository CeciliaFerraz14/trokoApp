import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { queryClient } from '@/lib/queryClient'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', code: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) return setError('Escribe tu nombre.')
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: { data: { full_name: form.name.trim() } },
    })
    if (error) {
      setLoading(false)
      return setError(errorMessage(error))
    }
    // Si Supabase tiene activada la confirmación por email no hay sesión todavía
    if (!data.session) {
      setLoading(false)
      return setNeedsConfirmation(true)
    }
    if (form.code.trim()) {
      const { error: codeError } = await supabase.rpc('join_with_code', { p_code: form.code })
      if (codeError) {
        // La cuenta ya existe: seguirá pendiente y podrá reintentar el código
        setError(`Cuenta creada, pero el código no ha funcionado: ${errorMessage(codeError)}`)
      }
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    }
    setLoading(false)
  }

  if (needsConfirmation) {
    return (
      <AuthLayout title="Revisa tu email">
        <p className="text-center text-white/80">
          Te hemos enviado un enlace para confirmar tu cuenta. Después, vuelve aquí e inicia sesión.
        </p>
        <Link to="/login" className="mt-8 block">
          <Button block>Ir a iniciar sesión</Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Únete a la batucada">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField label="Nombre y apellidos" autoComplete="name" required value={form.name} onChange={set('name')} />
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={form.email}
          onChange={set('email')}
        />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="Mínimo 8 caracteres."
          value={form.password}
          onChange={set('password')}
        />
        <TextField
          label="Código de invitación (opcional)"
          autoCapitalize="characters"
          autoComplete="off"
          hint="Si tu grupo te ha dado un código, tu cuenta se activa al momento. Si no, un admin la aprobará."
          value={form.code}
          onChange={set('code')}
          className="[&_input]:font-mono [&_input]:tracking-widest [&_input]:uppercase"
        />
        <FormError>{error}</FormError>
        <Button type="submit" block loading={loading} disabled={!form.email || !form.password || !form.name}>
          Crear cuenta
        </Button>
      </form>
      <p className="mt-8 text-center text-white/70">
        ¿Ya tienes cuenta?{' '}
        <Link to="/login" className="inline-block min-h-11 py-2.5 font-bold text-brand-blue">
          Inicia sesión
        </Link>
      </p>
    </AuthLayout>
  )
}
