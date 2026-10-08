import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, Camera, Trash2, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { GROUP_COLORS } from '@/lib/constants'
import { GroupDot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useGroup, useGroups } from '@/features/groups/api'
import { InviteCard } from '@/features/groups/InviteCard'
import { removeGroupImageFile, uploadGroupImage, useSaveGroup, type GroupInput } from './api'

const empty: GroupInput = { name: '', description: '', color: GROUP_COLORS[0], sort_order: 100, schedule: '', image: null }

export function AdminGroupPage() {
  const { id } = useParams()
  const isNew = !id
  const group = useGroup(id)
  const allGroups = useGroups({ includeArchived: true })
  const nextSortOrder = Math.max(0, ...(allGroups.data ?? []).map((g) => g.sort_order)) + 10
  const save = useSaveGroup()
  const navigate = useNavigate()
  const toast = useToast()
  const [form, setForm] = useState<GroupInput>(empty)
  const [error, setError] = useState<string | null>(null)
  // Foto nueva elegida (se sube al guardar) y su vista previa
  const [photo, setPhoto] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview])

  useEffect(() => {
    if (group.data) {
      const { name, description, color, sort_order, schedule, image } = group.data
      setForm({ name, description: description ?? '', color, sort_order, schedule: schedule ?? '', image })
    }
  }, [group.data])

  if (!isNew && group.isPending) return <><PageHeader title="Grupo" back /><Spinner /></>
  if (!isNew && group.isError) return <><PageHeader title="Grupo" back /><ErrorState error={group.error} onRetry={() => group.refetch()} /></>

  const set = <K extends keyof GroupInput>(k: K, v: GroupInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('El grupo necesita un nombre.')
    const oldImage = group.data?.image ?? null
    setUploading(true)
    try {
      let g = await save.mutateAsync({
        id,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        schedule: form.schedule?.trim() || null,
        color: form.color,
        // Quitar la foto se guarda aquí; una nueva se sube cuando el grupo ya existe
        image: photo ? oldImage : form.image,
        // El orden se cambia con las flechas de Admin → Grupos; uno nuevo va al final
        ...(isNew ? { sort_order: nextSortOrder } : {}),
      })
      if (photo) {
        g = await save.mutateAsync({ id: g.id, image: await uploadGroupImage(g.id, photo) })
        setPhoto(null)
      }
      // La foto anterior, si era una subida y ya no se usa, se borra del almacenamiento
      if (oldImage && oldImage !== g.image) await removeGroupImageFile(oldImage).catch(() => {})
      toast(isNew ? 'Grupo creado' : 'Cambios guardados')
      if (isNew) navigate(`/admin/grupos/${g.id}`, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const archived = !!group.data?.archived_at
  const toggleArchive = () => {
    const msg = archived
      ? '¿Recuperar este grupo?'
      : '¿Archivar este grupo? Dejará de aparecer, pero no se borra nada y podrás recuperarlo.'
    if (!confirm(msg)) return
    save.mutate(
      { id, archived_at: archived ? null : new Date().toISOString() },
      { onSuccess: () => toast(archived ? 'Grupo recuperado' : 'Grupo archivado'), onError: (e) => toast(errorMessage(e), 'error') },
    )
  }

  return (
    <>
      <PageHeader title={isNew ? 'Nuevo grupo' : form.name || 'Grupo'} back="/admin?tab=grupos" />
      <Page className="space-y-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            {preview ? (
              <img src={preview} alt="" className="size-28 rounded-full object-cover" />
            ) : form.image ? (
              <GroupDot color={form.color} image={form.image} imageClassName="size-28" />
            ) : (
              <span aria-hidden className="size-28 rounded-full" style={{ backgroundColor: form.color }} />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" icon={<Camera className="size-4" />} onClick={() => fileRef.current?.click()}>
                {form.image || photo ? 'Cambiar foto' : 'Poner foto'}
              </Button>
              {(form.image || photo) && (
                <Button
                  type="button"
                  variant="secondary"
                  icon={<Trash2 className="size-4" />}
                  onClick={() => {
                    setPhoto(null)
                    set('image', null)
                  }}
                >
                  Quitar
                </Button>
              )}
            </div>
            {(photo || form.image !== (group.data?.image ?? null)) && <p className="text-sm text-muted">Se guardará al pulsar «{isNew ? 'Crear grupo' : 'Guardar cambios'}».</p>}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file?.type.startsWith('image/')) setPhoto(file)
                e.target.value = ''
              }}
            />
          </div>
          <TextField label="Nombre" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <TextArea label="Descripción" value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          <TextField
            label="Horario habitual"
            placeholder="Lunes 18:30"
            value={form.schedule ?? ''}
            onChange={(e) => set('schedule', e.target.value)}
          />
          <div>
            <p className="mb-1.5 text-sm font-semibold text-muted">Color</p>
            <div className="flex flex-wrap gap-2">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  aria-pressed={form.color.toLowerCase() === c.toLowerCase()}
                  onClick={() => set('color', c)}
                  className={cn(
                    'size-11 rounded-full border-4 transition-transform',
                    form.color.toLowerCase() === c.toLowerCase() ? 'scale-110 border-fg' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <FormError>{error}</FormError>
          <Button type="submit" block loading={save.isPending || uploading}>
            {isNew ? 'Crear grupo' : 'Guardar cambios'}
          </Button>
        </form>

        {!isNew && id && (
          <>
            <InviteCard groupName={form.name} />
            <Link to={`/muro/${id}?tab=miembros`} className="block">
              <Button variant="secondary" block icon={<UsersRound className="size-4" />}>
                Ver miembros
              </Button>
            </Link>
            <Button
              variant={archived ? 'secondary' : 'danger'}
              block
              onClick={toggleArchive}
              icon={archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
            >
              {archived ? 'Recuperar grupo' : 'Archivar grupo'}
            </Button>
          </>
        )}
      </Page>
    </>
  )
}
