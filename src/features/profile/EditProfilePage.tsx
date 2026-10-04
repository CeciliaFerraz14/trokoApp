import { useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Camera, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image'
import { errorMessage } from '@/lib/errors'
import { INSTRUMENTS } from '@/lib/constants'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { FormError, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import type { Birthday, Profile } from '@/types/database'
import { BirthdayFields, birthDateError, useMyBirthday, useSaveBirthday } from './birthday'

export function EditProfilePage() {
  const { data: me } = useMe()
  const birthday = useMyBirthday()
  if (!me || birthday.isPending) return <Spinner />
  return <EditProfileForm profile={me.profile} birthday={birthday.data ?? null} />
}

function EditProfileForm({ profile, birthday }: { profile: Profile; birthday: Pick<Birthday, 'birth_date' | 'share'> | null }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [fullName, setFullName] = useState(profile.full_name)
  const [nickname, setNickname] = useState(profile.nickname ?? '')
  const [instruments, setInstruments] = useState<string[]>(profile.instruments)
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url)
  const [birthDate, setBirthDate] = useState(birthday?.birth_date ?? '')
  const [shareBirthday, setShareBirthday] = useState(birthday?.share ?? false)
  const saveBirthday = useSaveBirthday()
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleInstrument = (i: string) =>
    setInstruments((list) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]))

  async function onPickPhoto(file: File | undefined) {
    if (!file) return
    setError(null)
    setUploading(true)
    try {
      const { blob } = await compressImage(file, { maxSize: 512, quality: 0.85, square: true })
      const path = `${profile.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      // ?v= evita que el móvil siga mostrando la foto anterior en caché
      setAvatarUrl(`${data.publicUrl}?v=${Date.now()}`)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setUploading(false)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (fullName.trim().length < 2) return setError('Escribe tu nombre.')
    // Quien tenía cuenta antes de pedir la fecha puede dejarla vacía (pero no compartirla así)
    const dateError = birthDate || birthday || shareBirthday ? birthDateError(birthDate) : null
    if (dateError) return setError(dateError)
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        nickname: nickname.trim() || null,
        instruments,
        avatar_url: avatarUrl,
      })
      .eq('id', profile.id)
    if (error) {
      setSaving(false)
      return setError(errorMessage(error))
    }
    if (birthDate && (birthDate !== birthday?.birth_date || shareBirthday !== birthday?.share)) {
      try {
        await saveBirthday.mutateAsync({ birthDate, share: shareBirthday })
      } catch (err) {
        setSaving(false)
        return setError(errorMessage(err))
      }
    }
    setSaving(false)
    await qc.invalidateQueries({ queryKey: ['me'] })
    await qc.invalidateQueries({ queryKey: ['group-members'] })
    toast('Perfil guardado')
    navigate('/perfil')
  }

  return (
    <>
      <PageHeader title="Editar perfil" back="/perfil" />
      <Page>
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative rounded-full"
              aria-label="Cambiar foto"
              disabled={uploading}
            >
              <Avatar name={fullName} url={avatarUrl} size="xl" className={cn(uploading && 'opacity-50')} />
              <span className="absolute right-0 bottom-0 grid size-10 place-items-center rounded-full bg-brand-blue text-brand-black ring-4 ring-bg">
                <Camera className="size-5" />
              </span>
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onPickPhoto(e.target.files?.[0])} />
            {uploading && <p className="mt-2 text-sm text-muted">Subiendo foto…</p>}
          </div>

          <TextField label="Nombre y apellidos" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} />
          <TextField
            label="Apodo"
            hint="Como te llaman en la batucada. Es lo que verá la gente."
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={40}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-muted">Instrumentos</legend>
            <div className="flex flex-wrap gap-2">
              {INSTRUMENTS.map((i) => {
                const on = instruments.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleInstrument(i)}
                    className={cn(
                      'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold',
                      on ? 'border-brand-blue bg-brand-blue text-brand-black' : 'border-line bg-surface-2',
                    )}
                  >
                    {on && <Check className="size-4" />}
                    {i}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-muted">Cumpleaños</legend>
            <BirthdayFields date={birthDate} share={shareBirthday} onDate={setBirthDate} onShare={setShareBirthday} />
          </fieldset>

          <FormError>{error}</FormError>
          <Button type="submit" block loading={saving} disabled={uploading}>
            Guardar
          </Button>
        </form>
      </Page>
    </>
  )
}
