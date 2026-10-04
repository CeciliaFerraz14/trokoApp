import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { CalendarDays, Database, HardDrive, Image, Megaphone, MessageSquare, MessagesSquare, UserRound } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Card, SectionTitle } from '@/components/ui/Card'
import { GroupDot } from '@/components/ui/Badge'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { useGroups } from '@/features/groups/api'
import { useAdminStats, useAllUsers } from './api'

// Límites del plan gratuito de Supabase
const STORAGE_LIMIT = 1024 ** 3 // 1 GB de archivos
const DATABASE_LIMIT = 500 * 1024 ** 2 // 500 MB de base de datos

function formatBytes(bytes: number) {
  if (bytes < 1024 ** 2) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(bytes < 10 * 1024 ** 2 ? 1 : 0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function SummaryTab() {
  const stats = useAdminStats()
  const users = useAllUsers()
  const groups = useGroups()

  if (stats.isPending) return <SkeletonList count={3} className="h-32" />
  if (stats.isError) return <ErrorState error={stats.error} onRetry={() => stats.refetch()} />
  const s = stats.data

  // Personas activas por grupo
  const counts = new Map<string, number>()
  for (const u of users.data ?? []) {
    if (u.status !== 'active') continue
    for (const m of u.memberships) counts.set(m.group_id, (counts.get(m.group_id) ?? 0) + 1)
  }

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle>Personas</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={s.people.active} label="activas" />
          <Link to="/admin?tab=pendientes" className="block">
            <Stat value={s.people.pending} label="pendientes" highlight={s.people.pending > 0} />
          </Link>
          <Stat value={s.people.admins} label={s.people.admins === 1 ? 'admin' : 'admins'} />
        </div>
      </section>

      <section>
        <SectionTitle>Uso del plan gratuito</SectionTitle>
        <Card className="space-y-4">
          <Usage
            icon={<HardDrive className="size-4" />}
            label="Fotos"
            used={s.storage.wall_bytes + (s.storage.chat_bytes ?? 0) + s.storage.avatars_bytes}
            limit={STORAGE_LIMIT}
            detail={`Muro ${formatBytes(s.storage.wall_bytes)} · chat ${formatBytes(s.storage.chat_bytes ?? 0)} · avatares ${formatBytes(s.storage.avatars_bytes)}`}
          />
          <Usage icon={<Database className="size-4" />} label="Base de datos" used={s.database_bytes} limit={DATABASE_LIMIT} />
          <p className="text-sm text-muted">
            Si alguna barra se acerca al final, borra fotos antiguas del muro o del chat, o pasa el proyecto a un plan de pago de Supabase.
          </p>
        </Card>
      </section>

      <section>
        <SectionTitle>Contenido</SectionTitle>
        <Card className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Count icon={<Megaphone className="size-4" />} value={s.content.announcements} label="avisos" />
          <Count icon={<CalendarDays className="size-4" />} value={s.content.events} label="eventos próximos" />
          <Count icon={<MessagesSquare className="size-4" />} value={s.content.posts} label="publicaciones" />
          <Count icon={<Image className="size-4" />} value={s.content.photos} label="fotos" />
          <Count icon={<MessageSquare className="size-4" />} value={s.content.comments} label="comentarios" />
          <Count icon={<MessagesSquare className="size-4" />} value={s.content.messages ?? 0} label="mensajes del chat" />
        </Card>
      </section>

      {groups.data && (
        <section>
          <SectionTitle>Personas por grupo</SectionTitle>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {groups.data.map((g) => (
              <li key={g.id}>
                <Link to={`/muro/${g.id}?tab=miembros`} className="flex min-h-12 items-center gap-3 px-4 hover:bg-surface-2">
                  <GroupDot color={g.color} />
                  <span className="flex-1 font-semibold">{g.name}</span>
                  <span className="flex items-center gap-1 text-muted">
                    <UserRound className="size-4" aria-hidden /> {counts.get(g.id) ?? 0}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Stat({ value, label, highlight }: { value: number; label: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-2xl border bg-surface p-3 text-center', highlight ? 'border-warning/60' : 'border-line')}>
      <p className={cn('font-display text-3xl font-bold', highlight && 'text-warning')}>{value}</p>
      <p className="text-sm text-muted">{label}</p>
    </div>
  )
}

function Count({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className="text-accent">{icon}</span>
      <span className="font-bold">{value}</span>
      <span className="text-muted">{label}</span>
    </p>
  )
}

function Usage({ icon, label, used, limit, detail }: { icon: ReactNode; label: string; used: number; limit: number; detail?: string }) {
  const pct = Math.min(100, (used / limit) * 100)
  const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-brand-blue'
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2 text-sm">
        <span className="text-accent">{icon}</span>
        <span className="flex-1 font-semibold">{label}</span>
        <span className="text-muted">
          {formatBytes(used)} de {formatBytes(limit)}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </div>
  )
}
