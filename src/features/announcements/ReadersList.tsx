import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Eye } from 'lucide-react'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { displayName } from '@/features/groups/api'
import { useOpenProfile, type ProfilePreview } from '@/features/profile/ProfileSheet'
import type { AnnouncementItem } from './api'

const PERSON = 'id, full_name, nickname, avatar_url, status'
type Person = ProfilePreview & { status: string }

/**
 * Quién ha visto el aviso y a quién le falta (para autor/a y admins).
 * "Le falta" = quien debería verlo (todas las cuentas activas si es general;
 * si no, las de sus grupos) y aún no lo ha abierto.
 */
function useReaders(a: AnnouncementItem, enabled: boolean) {
  return useQuery({
    queryKey: ['announcement-readers', a.id],
    enabled,
    queryFn: async () => {
      const [reads, audience] = await Promise.all([
        supabase.from('announcement_reads').select(`read_at, profile:profiles(${PERSON})`).eq('announcement_id', a.id),
        a.group_ids.length
          ? supabase.from('group_members').select(`profile:profiles(${PERSON})`).in('group_id', a.group_ids)
          : supabase.from('profiles').select(PERSON).eq('status', 'active'),
      ])
      if (reads.error) throw reads.error
      if (audience.error) throw audience.error
      const seen = ((reads.data ?? []) as unknown as { read_at: string; profile: Person | null }[])
        .flatMap((r) => (r.profile ? [r.profile] : []))
      const seenIds = new Set(seen.map((p) => p.id))
      const everyone = new Map<string, Person>()
      for (const row of (audience.data ?? []) as unknown as (Person | { profile: Person | null })[]) {
        const p = 'profile' in row ? row.profile : row
        if (p && p.status === 'active') everyone.set(p.id, p)
      }
      const byName = (x: Person, y: Person) => displayName(x).localeCompare(displayName(y), 'es')
      const missing = [...everyone.values()]
        // Ni quien lo escribió ni quien cumple años (en las felicitaciones)
        .filter((p) => !seenIds.has(p.id) && p.id !== a.author_id && p.id !== a.birthday_of)
        .sort(byName)
      return { seen: seen.sort(byName), missing }
    },
  })
}

export function ReadersList({ announcement: a }: { announcement: AnnouncementItem }) {
  const [open, setOpen] = useState(false)
  const readers = useReaders(a, open)

  return (
    <div className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 px-4 text-left text-sm">
        <Eye className="size-4 text-muted" aria-hidden />
        <span className="flex-1 font-semibold">
          {a.readCount === 1 ? 'Lo ha visto 1 persona' : `Lo han visto ${a.readCount} personas`}
          {readers.data && <span className="font-normal text-muted"> · faltan {readers.data.missing.length}</span>}
        </span>
        <ChevronDown className={cn('size-5 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line px-4 py-3">
          {readers.isPending ? (
            <SkeletonList count={2} className="h-10" />
          ) : readers.isError ? (
            <ErrorState error={readers.error} onRetry={() => readers.refetch()} />
          ) : (
            <>
              <People title={`Falta por verlo (${readers.data.missing.length})`} people={readers.data.missing} empty="Ya lo ha visto todo el mundo 🎉" />
              <People title={`Lo han visto (${readers.data.seen.length})`} people={readers.data.seen} empty="Todavía nadie." />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function People({ title, people, empty }: { title: string; people: Person[]; empty: string }) {
  const openProfile = useOpenProfile()
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-muted">{title}</h3>
      {people.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => openProfile(p)} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-3 pl-0.5 text-sm font-semibold">
                <Avatar name={p.full_name} url={p.avatar_url} size="sm" className="size-7 text-[0.65rem]" />
                {displayName(p)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
