import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, GroupRole, Profile } from '@/types/database'

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
