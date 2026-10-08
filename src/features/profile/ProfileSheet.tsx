import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Pencil, ShieldCheck, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components/ui/Avatar'
import { Badge, GroupDot } from '@/components/ui/Badge'
import { ErrorState, SkeletonList } from '@/components/ui/States'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import type { Group, GroupRole, Profile } from '@/types/database'

/** Lo que ya se sabe de la persona al tocarla: se enseña al instante mientras carga el resto */
export type ProfilePreview = Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'>

const OpenContext = createContext<(person: ProfilePreview) => void>(() => {})

/** Abre la ficha de una persona (en Miembros, en el chat…) */
export function useOpenProfile() {
  return useContext(OpenContext)
}

export function ProfileSheetProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<ProfilePreview | null>(null)
  const { pathname, search } = useLocation()
  // Al cambiar de pantalla (p. ej. "Editar mi perfil") se cierra
  useEffect(() => setPerson(null), [pathname, search])
  return (
    <OpenContext.Provider value={setPerson}>
      {children}
      {person && <ProfileSheet key={person.id} person={person} onClose={() => setPerson(null)} />}
    </OpenContext.Provider>
  )
}

function usePersonCard(userId: string) {
  return useQuery({
    queryKey: ['person-card', userId],
    queryFn: async () => {
      const [profile, groups] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('group_members').select('role, group:groups(*)').eq('user_id', userId),
      ])
      if (profile.error) throw profile.error
      if (groups.error) throw groups.error
      const memberships = ((groups.data ?? []) as unknown as { role: GroupRole; group: Group | null }[])
        .filter((m): m is { role: GroupRole; group: Group } => !!m.group && !m.group.archived_at)
        .sort((a, b) => a.group.sort_order - b.group.sort_order)
      return { profile: profile.data, memberships }
    },
  })
}

/** Ficha de una persona: hoja que sube desde abajo, encima de la pantalla */
function ProfileSheet({ person, onClose }: { person: ProfilePreview; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const card = usePersonCard(person.id)
  const { data: me } = useMe()

  useEffect(() => {
    dialog.current?.showModal()
    // Que la página de detrás no se mueva mientras está abierta
    const root = document.documentElement
    const prev = root.style.overflow
    root.style.overflow = 'hidden'
    return () => {
      root.style.overflow = prev
    }
  }, [])

  const p = card.data?.profile
  const memberships = card.data?.memberships ?? []
  const coordinates = memberships.filter((m) => m.role === 'coordinator')
  const since = p?.approved_at ?? p?.created_at

  return (
    <dialog
      ref={dialog}
      aria-label={`Perfil de ${displayName(person)}`}
      onClose={onClose}
      // Tocar fuera de la hoja (en el fondo oscuro) la cierra
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="mx-auto mt-auto mb-0 max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-surface text-fg shadow-2xl backdrop:bg-black/60"
    >
      <div className="relative px-5 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
        <span aria-hidden className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-line" />
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          aria-label="Cerrar"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
        >
          <X className="size-5" />
        </button>

        <div className="flex flex-col items-center pt-2 text-center">
          <Avatar name={person.full_name} url={p?.avatar_url ?? person.avatar_url} size="2xl" />
          <h2 className="mt-3 text-2xl font-bold">{displayName(p ?? person)}</h2>
          {(p ?? person).nickname && <p className="text-muted">{(p ?? person).full_name}</p>}
          {(p?.role === 'admin' || coordinates.length > 0) && (
            <div className="mt-2 flex flex-wrap justify-center gap-1.5">
              {p?.role === 'admin' && <Badge tone="brand">Admin</Badge>}
              {coordinates.map((m) => (
                <Badge key={m.group.id} tone="brand">
                  Coordina {m.group.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {card.isPending ? (
          <SkeletonList count={2} className="mt-5 h-12" />
        ) : card.isError ? (
          <ErrorState error={card.error} onRetry={() => card.refetch()} />
        ) : !p ? (
          <p className="mt-5 text-center text-muted">Esta cuenta ya no está activa.</p>
        ) : (
          <div className="mt-5 space-y-5">
            {p.bio && <p className="rounded-2xl bg-surface-2 px-4 py-3 break-words whitespace-pre-line">{p.bio}</p>}

            {p.instruments.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted">Instrumentos</h3>
                <div className="flex flex-wrap gap-1.5">
                  {p.instruments.map((i) => (
                    <Badge key={i}>🥁 {i}</Badge>
                  ))}
                </div>
              </section>
            )}

            {memberships.length > 0 && (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-muted">Grupos</h3>
                <ul className="flex flex-wrap gap-2">
                  {memberships.map(({ group }) => (
                    <li key={group.id}>
                      <Link
                        to={`/muro/${group.id}`}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pr-3.5 pl-1.5 text-sm font-bold hover:border-brand-blue"
                      >
                        <GroupDot color={group.color} image={group.image} className="ml-1.5" imageClassName="size-8" />
                        {group.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {since && <p className="text-sm text-muted">En Troko desde {format(new Date(since), "MMMM 'de' yyyy", { locale: es })}</p>}

            {p.id === me?.profile.id ? (
              <Link to="/perfil/editar" className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface-2 font-semibold hover:bg-line">
                <Pencil className="size-4" /> Editar mi perfil
              </Link>
            ) : (
              me?.isAdmin && (
                <Link to={`/admin/personas/${p.id}`} className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-surface-2 font-semibold hover:bg-line">
                  <ShieldCheck className="size-4" /> Ver en Admin
                </Link>
              )
            )}
          </div>
        )}
      </div>
    </dialog>
  )
}
