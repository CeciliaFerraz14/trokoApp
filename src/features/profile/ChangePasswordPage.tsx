import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { useToast } from '@/components/ui/Toast'

export function ChangePasswordPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (password !== repeat) return setError('Las dos contraseñas no coinciden.')
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(errorMessage(error))
    toast('Contraseña cambiada')
    navigate('/perfil')
  }

  return (
    <>
      <PageHeader title="Contraseña" back="/perfil" />
      <Page>
        <form onSubmit={onSubmit} className="space-y-4">
          <TextField
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            hint="Mínimo 8 caracteres."
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <TextField
            label="Repítela"
            type="password"
            autoComplete="new-password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          <FormError>{error}</FormError>
          <Button type="submit" block loading={loading} disabled={!password || !repeat}>
            Cambiar contraseña
          </Button>
        </form>
      </Page>
    </>
  )
}
