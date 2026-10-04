import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { BirthdayFields, birthDateError } from '@/features/profile/birthday'
import { AuthLayout } from './AuthLayout'

export function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [birthDate, setBirthDate] = useState('')
  const [shareBirthday, setShareBirthday] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (form.name.trim().length < 2) return setError('Escribe tu nombre.')
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    const dateError = birthDateError(birthDate)
    if (dateError) return setError(dateError)

    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      // La base de datos guarda la fecha aparte, donde solo la ve esta persona
      options: { data: { full_name: form.name.trim(), birth_date: birthDate, share_birthday: shareBirthday } },
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
    // La cuenta queda pendiente: un admin la aprueba desde Admin → Pendientes
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
        <BirthdayFields date={birthDate} share={shareBirthday} onDate={setBirthDate} onShare={setShareBirthday} />
        <p className="text-sm text-white/70">Un admin de Troko Bloco revisará tu cuenta y te dará acceso. Después podrás pedir entrar en tus grupos.</p>
        <FormError>{error}</FormError>
        <Button type="submit" block loading={loading} disabled={!form.email || !form.password || !form.name || !birthDate} className="min-h-14 text-lg">
          Crear cuenta
        </Button>
      </form>
      <p className="mt-8 mb-2 text-center text-white/70">¿Ya tienes cuenta?</p>
      <Link to="/login" className="flex min-h-14 items-center justify-center rounded-full border-2 border-brand-blue font-display text-lg font-semibold text-brand-blue transition-colors hover:bg-brand-blue/10">
        Entrar
      </Link>
    </AuthLayout>
  )
}
