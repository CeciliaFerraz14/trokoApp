import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { GROUP_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useGroup, useGroups } from '@/features/groups/api'
import { InviteCodeCard } from '@/features/groups/InviteCodeCard'
import { useSaveGroup, type GroupInput } from './api'

const empty: GroupInput = { name: '', description: '', color: GROUP_COLORS[0], sort_order: 100, schedule: '' }

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

  useEffect(() => {
    if (group.data) {
      const { name, description, color, sort_order, schedule } = group.data
      setForm({ name, description: description ?? '', color, sort_order, schedule: schedule ?? '' })
    }
  }, [group.data])

  if (!isNew && group.isPending) return <><PageHeader title="Grupo" back /><Spinner /></>
  if (!isNew && group.isError) return <><PageHeader title="Grupo" back /><ErrorState error={group.error} onRetry={() => group.refetch()} /></>

  const set = <K extends keyof GroupInput>(k: K, v: GroupInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.name.trim()) return setError('El grupo necesita un nombre.')
    save.mutate(
      {
        id,
        name: form.name.trim(),
        description: form.description?.trim() || null,
        schedule: form.schedule?.trim() || null,
        color: form.color,
        // El orden se cambia con las flechas de Admin → Grupos; uno nuevo va al final
        ...(isNew ? { sort_order: nextSortOrder } : {}),
      },
      {
        onSuccess: (g) => {
          toast(isNew ? 'Grupo creado' : 'Cambios guardados')
          if (isNew) navigate(`/admin/grupos/${g.id}`, { replace: true })
        },
        onError: (e) => setError(errorMessage(e)),
      },
    )
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
          <Button type="submit" block loading={save.isPending}>
            {isNew ? 'Crear grupo' : 'Guardar cambios'}
          </Button>
        </form>

        {!isNew && id && (
          <>
            <InviteCodeCard groupId={id} groupName={form.name} canRegenerate />
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
