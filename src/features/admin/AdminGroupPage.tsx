import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, ArchiveRestore, Copy, RefreshCw, Share2, UsersRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { GROUP_COLORS } from '@/lib/constants'
import { Button } from '@/components/ui/Button'
import { Card, SectionTitle } from '@/components/ui/Card'
import { FormError, TextArea, TextField } from '@/components/ui/Field'
import { Page, PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, Spinner } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useGroup } from '@/features/groups/api'
import { useInviteCode, useRegenerateCode, useSaveGroup, type GroupInput } from './api'

const empty: GroupInput = { name: '', description: '', color: GROUP_COLORS[0], sort_order: 100, schedule: '' }

export function AdminGroupPage() {
  const { id } = useParams()
  const isNew = !id
  const group = useGroup(id)
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
        sort_order: Number(form.sort_order) || 0,
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
          <TextField
            label="Orden"
            type="number"
            inputMode="numeric"
            hint="Los grupos se ordenan de menor a mayor (p. ej. por nivel)."
            value={form.sort_order}
            onChange={(e) => set('sort_order', Number(e.target.value))}
          />
          <FormError>{error}</FormError>
          <Button type="submit" block loading={save.isPending}>
            {isNew ? 'Crear grupo' : 'Guardar cambios'}
          </Button>
        </form>

        {!isNew && id && (
          <>
            <InviteCodeCard groupId={id} groupName={form.name} />
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

function InviteCodeCard({ groupId, groupName }: { groupId: string; groupName: string }) {
  const code = useInviteCode(groupId)
  const regenerate = useRegenerateCode()
  const toast = useToast()
  const value = code.data?.code

  const message = `¡Únete a ${groupName} en la app de Troko Bloco! Regístrate en ${location.origin}/registro con el código ${value}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value ?? '')
      toast('Código copiado')
    } catch {
      toast('No se pudo copiar', 'error')
    }
  }
  const share = () => navigator.share?.({ title: 'Troko Bloco', text: message }).catch(() => {})

  return (
    <section>
      <SectionTitle>Código de invitación</SectionTitle>
      <Card className="space-y-3 text-center">
        <p className="font-mono text-4xl font-bold tracking-[0.3em] text-accent">{value ?? '······'}</p>
        <p className="text-sm text-muted">
          Quien se registre con este código entra directamente en <strong>{groupName}</strong> sin esperar aprobación.
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={copy} icon={<Copy className="size-4" />} disabled={!value}>
            Copiar
          </Button>
          {'share' in navigator && (
            <Button variant="secondary" className="flex-1" onClick={share} icon={<Share2 className="size-4" />} disabled={!value}>
              Compartir
            </Button>
          )}
        </div>
        <Button
          variant="ghost"
          block
          loading={regenerate.isPending}
          icon={<RefreshCw className="size-4" />}
          onClick={() =>
            confirm('¿Generar un código nuevo? El anterior dejará de funcionar.') &&
            regenerate.mutate(groupId, { onSuccess: () => toast('Código regenerado'), onError: (e) => toast(errorMessage(e), 'error') })
          }
        >
          Regenerar código
        </Button>
      </Card>
    </section>
  )
}
