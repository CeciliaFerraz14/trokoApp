import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tag } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { TextField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { useAuth } from '@/features/auth/AuthProvider'

/** Usuario de Instagram sin @ ni espacios, en minúsculas ('' si está vacío) */
export function normalizeInstagram(value: string) {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

/** Error de validación del usuario de Instagram, o null si es válido o está vacío */
export function instagramError(value: string) {
  const username = normalizeInstagram(value)
  if (!username) return null
  if (!/^[a-z0-9._]{1,30}$/.test(username)) return 'El usuario de Instagram solo puede tener letras, números, puntos y guiones bajos.'
  return null
}

/** Usuario de Instagram y permiso para etiquetarle (registro y privacidad) */
export function InstagramFields({
  username,
  consent,
  onUsername,
  onConsent,
}: {
  username: string
  consent: boolean
  onUsername: (value: string) => void
  onConsent: (value: boolean) => void
}) {
  const empty = !normalizeInstagram(username)
  return (
    <div className="space-y-3">
      <TextField
        label="Usuario de Instagram (opcional)"
        hint="Para poder etiquetarte en las fotos y vídeos que publique Troko Bloco."
        placeholder="@tu_usuario"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={31}
        value={username}
        onChange={(e) => onUsername(e.target.value)}
      />
      <Switch
        label="Acepto que me etiqueten"
        hint="Solo lo verán los admins de Troko Bloco, y solo si lo aceptas. Puedes cambiarlo cuando quieras en Perfil → Privacidad."
        icon={<Tag className="size-5" />}
        checked={consent && !empty}
        onChange={onConsent}
        disabled={empty}
      />
    </div>
  )
}

/** Mi usuario de Instagram (null si no lo he puesto) */
export function useMyInstagram() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['instagram', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('instagram').select('username, tag_consent').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

/** Guarda mi usuario de Instagram; si está vacío, lo borra */
export function useSaveInstagram() {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ username, consent }: { username: string; consent: boolean }) => {
      const value = normalizeInstagram(username)
      const { error } = value
        ? await supabase.from('instagram').upsert({ user_id: userId!, username: value, tag_consent: consent }, { onConflict: 'user_id' })
        : await supabase.from('instagram').delete().eq('user_id', userId!)
      if (error) throw error
    },
    // Se pone ya en la caché: si se vuelve a abrir Privacidad, el formulario
    // arranca con lo guardado y no con lo anterior
    onSuccess: (_, { username, consent }) => {
      const value = normalizeInstagram(username)
      qc.setQueryData(['instagram', userId], value ? { username: value, tag_consent: consent } : null)
      void qc.invalidateQueries({ queryKey: ['instagram', userId] })
    },
  })
}

/** Instagram de otra persona, para admins (null si no lo tiene o no da permiso) */
export function useInstagramOf(userId: string | undefined) {
  return useQuery({
    queryKey: ['instagram', 'of', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('instagram').select('username, tag_consent').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      // Mi propia cuenta siempre se ve: sin permiso, como si no lo tuviera
      return data?.tag_consent ? data.username : null
    },
    enabled: !!userId,
  })
}
