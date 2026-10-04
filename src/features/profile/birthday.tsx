import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Cake } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toDateInput } from '@/lib/dates'
import { TextField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { useAuth } from '@/features/auth/AuthProvider'

/** Error de validación de la fecha de nacimiento, o null si es válida */
export function birthDateError(value: string) {
  if (!value) return 'Pon tu fecha de nacimiento.'
  if (value < '1900-01-01' || value > toDateInput(new Date())) return 'La fecha de nacimiento no es válida.'
  return null
}

/** Fecha de nacimiento y si se comparte el cumpleaños (registro y editar perfil) */
export function BirthdayFields({
  date,
  share,
  onDate,
  onShare,
}: {
  date: string
  share: boolean
  onDate: (value: string) => void
  onShare: (value: boolean) => void
}) {
  return (
    <div className="space-y-3">
      <TextField
        label="Fecha de nacimiento"
        type="date"
        required
        min="1900-01-01"
        max={toDateInput(new Date())}
        value={date}
        onChange={(e) => onDate(e.target.value)}
      />
      <Switch
        label="Compartir mi cumpleaños con mis grupos"
        hint="Ese día lo felicitaremos en Avisos y les llegará una notificación. Nadie verá tu fecha ni tu edad."
        icon={<Cake className="size-5" />}
        checked={share}
        onChange={onShare}
      />
    </div>
  )
}

/** Mi fecha de nacimiento (null si no la he puesto) */
export function useMyBirthday() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['birthday', userId],
    queryFn: async () => {
      const { data, error } = await supabase.from('birthdays').select('birth_date, share').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

export function useSaveBirthday() {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ birthDate, share }: { birthDate: string; share: boolean }) => {
      const { error } = await supabase
        .from('birthdays')
        .upsert({ user_id: userId!, birth_date: birthDate, share }, { onConflict: 'user_id' })
      if (error) throw error
    },
    // Se pone ya en la caché: si se vuelve a abrir Editar perfil, el formulario
    // arranca con lo guardado y no con lo anterior
    onSuccess: (_, { birthDate, share }) => {
      qc.setQueryData(['birthday', userId], { birth_date: birthDate, share })
      void qc.invalidateQueries({ queryKey: ['birthday', userId] })
    },
  })
}
