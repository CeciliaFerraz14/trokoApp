import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, GroupRole, Profile } from '@/types/database'
import { useAuth } from './AuthProvider'

export interface Membership {
  role: GroupRole
  group: Group
}

export interface Me {
  profile: Profile
  memberships: Membership[]
  isAdmin: boolean
  /** Grupos donde coordina (o todos si es admin) */
  canManageGroup: (groupId: string) => boolean
}

/** Lo que se guarda en caché (y en IndexedDB): solo datos, sin funciones */
type MeData = Omit<Me, 'canManageGroup'>

async function fetchMe(userId: string): Promise<MeData> {
  const [{ data: profile, error: e1 }, { data: rows, error: e2 }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('group_members').select('role, group:groups(*)').eq('user_id', userId),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const memberships = (rows ?? [])
    .filter((r): r is { role: GroupRole; group: Group } => !!r.group)
    .filter((r) => !r.group.archived_at)
    .sort((a, b) => a.group.sort_order - b.group.sort_order)

  return {
    profile,
    memberships,
    isAdmin: profile.role === 'admin' && profile.status === 'active',
  }
}

// Las funciones se añaden al leer: la caché persistida en IndexedDB se guarda
// como JSON y perdería cualquier función guardada en los datos.
function withHelpers(data: MeData): Me {
  const coordinated = new Set(data.memberships.filter((m) => m.role === 'coordinator').map((m) => m.group.id))
  return { ...data, canManageGroup: (id) => data.isAdmin || coordinated.has(id) }
}

/** Perfil y grupos de la persona que ha iniciado sesión */
export function useMe() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['me', userId],
    queryFn: () => fetchMe(userId!),
    select: withHelpers,
    enabled: !!userId,
  })
}
