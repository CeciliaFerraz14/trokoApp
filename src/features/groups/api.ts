import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, GroupRole, JoinRequestStatus, Profile } from '@/types/database'
import { useAuth } from '@/features/auth/AuthProvider'

export function useGroups({ includeArchived = false } = {}) {
  return useQuery({
    queryKey: ['groups', { includeArchived }],
    queryFn: async () => {
      let q = supabase.from('groups').select('*').order('sort_order').order('name')
      if (!includeArchived) q = q.is('archived_at', null)
      const { data, error } = await q
      if (error) throw error
      return data
    },
  })
}

export function useGroup(id: string | undefined) {
  return useQuery({
    queryKey: ['group', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('groups').select('*').eq('id', id!).single()
      if (error) throw error
      return data as Group
    },
    enabled: !!id,
  })
}

export interface GroupMemberWithProfile {
  role: GroupRole
  profile: Profile
}

export function useGroupMembers(groupId: string | undefined) {
  return useQuery({
    queryKey: ['group-members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_members')
        .select('role, profile:profiles(*)')
        .eq('group_id', groupId!)
      if (error) throw error
      return (data ?? [])
        .filter((r): r is GroupMemberWithProfile => !!r.profile && r.profile.status === 'active')
        .sort(
          (a, b) =>
            (a.role === 'coordinator' ? 0 : 1) - (b.role === 'coordinator' ? 0 : 1) ||
            displayName(a.profile).localeCompare(displayName(b.profile), 'es'),
        )
    },
    enabled: !!groupId,
  })
}

export function displayName(p: Pick<Profile, 'full_name' | 'nickname'>) {
  return p.nickname?.trim() || p.full_name || 'Sin nombre'
}

// ---------------------------------------------------------------------------
// Solicitudes para entrar en grupos
// ---------------------------------------------------------------------------

type RequestRow = { group_id: string; status: JoinRequestStatus }
const toRequestMap = (rows: RequestRow[]) => new Map(Array.isArray(rows) ? rows.map((r) => [r.group_id, r.status]) : [])

/** Mis solicitudes como mapa grupo → estado (pendiente o rechazada) */
export function useMyJoinRequests() {
  const { session } = useAuth()
  const userId = session?.user.id
  const qc = useQueryClient()
  const key = ['join-requests', 'mine', userId]
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase.from('group_join_requests').select('group_id, status').eq('user_id', userId!)
      if (error) throw error
      const now = data ?? []
      // Una solicitud pendiente que desaparece = me han aceptado: refrescar mis grupos
      const before = qc.getQueryData<RequestRow[]>(key)
      if (Array.isArray(before) && before.some((b) => b.status === 'pending' && !now.some((n) => n.group_id === b.group_id))) {
        void qc.invalidateQueries({ queryKey: ['me'] })
      }
      return now
    },
    // Se guarda la lista tal cual (la caché va a IndexedDB como JSON, un Map se perdería)
    select: toRequestMap,
    enabled: !!userId,
    // Siempre al servidor al abrir (la copia guardada podría ser de antes de que me respondieran)
    staleTime: 0,
    refetchInterval: 60_000,
  })
}

function useInvalidateRequests() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['join-requests'] }),
      // Al aceptar, cambian mis grupos
      qc.invalidateQueries({ queryKey: ['me'] }),
    ])
}

export function useRequestAccess() {
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.rpc('request_group_access', { p_group: groupId })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Cancelar una solicitud pendiente o descartar un rechazo */
export function useCancelRequest() {
  const { session } = useAuth()
  const invalidate = useInvalidateRequests()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from('group_join_requests').delete().eq('group_id', groupId).eq('user_id', session!.user.id)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
