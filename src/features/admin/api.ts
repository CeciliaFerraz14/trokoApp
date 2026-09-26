import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AccountStatus, AppRole, Group, GroupRole, Profile } from '@/types/database'

export function usePendingUsers({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['admin', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  })
}

export interface AdminUser extends Profile {
  memberships: { group_id: string; role: GroupRole }[]
}

export function useAllUsers() {
  return useQuery({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, memberships:group_members(group_id, role)')
        .order('full_name')
      if (error) throw error
      return data as AdminUser[]
    },
  })
}

/** Emails de todas las cuentas (solo admin) como mapa id → email */
export function useUserEmails() {
  return useQuery({
    queryKey: ['admin', 'emails'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_emails')
      if (error) throw error
      return new Map((data ?? []).map((r) => [r.id, r.email]))
    },
    staleTime: 5 * 60_000,
  })
}

export function useInviteCode(groupId: string | undefined) {
  return useQuery({
    queryKey: ['invite-code', groupId],
    queryFn: async () => {
      const { data, error } = await supabase.from('group_invite_codes').select('*').eq('group_id', groupId!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!groupId,
  })
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

function useInvalidateAdmin() {
  const qc = useQueryClient()
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['admin'] }),
      qc.invalidateQueries({ queryKey: ['group-members'] }),
      qc.invalidateQueries({ queryKey: ['me'] }),
    ])
}

export function useApproveUser() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async ({ userId, groupIds }: { userId: string; groupIds: string[] }) => {
      const { error } = await supabase.rpc('approve_user', { p_user: userId, p_groups: groupIds })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useUpdateUserAccount() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async ({ userId, ...patch }: { userId: string; role?: AppRole; status?: AccountStatus }) => {
      const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

/** Asigna/quita un grupo o cambia el rol dentro de él. role = null → quitar del grupo */
export function useSetMembership() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: async ({ userId, groupId, role }: { userId: string; groupId: string; role: GroupRole | null }) => {
      const { error } =
        role === null
          ? await supabase.from('group_members').delete().eq('user_id', userId).eq('group_id', groupId)
          : await supabase.from('group_members').upsert({ user_id: userId, group_id: groupId, role })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export type GroupInput = Pick<Group, 'name' | 'description' | 'color' | 'sort_order' | 'schedule'>

export function useSaveGroup() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...input }: Partial<GroupInput> & { id?: string; archived_at?: string | null }) => {
      const { data, error } = id
        ? await supabase.from('groups').update(input).eq('id', id).select().single()
        : await supabase
            .from('groups')
            .insert({ ...input, name: input.name ?? '' })
            .select()
            .single()
      if (error) throw error
      return data
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ['groups'] }),
        qc.invalidateQueries({ queryKey: ['group'] }),
        qc.invalidateQueries({ queryKey: ['me'] }),
      ]),
  })
}

export function useRegenerateCode() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (groupId: string) => {
      const { data, error } = await supabase.rpc('regenerate_invite_code', { p_group: groupId })
      if (error) throw error
      return data
    },
    onSuccess: (_d, groupId) => qc.invalidateQueries({ queryKey: ['invite-code', groupId] }),
  })
}

// ---------------------------------------------------------------------------
// Resumen, contraseñas y borrado de cuentas
// ---------------------------------------------------------------------------

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_stats')
      if (error) throw error
      return data
    },
  })
}

export function useResetPassword() {
  return useMutation({
    mutationFn: async ({ userId, password }: { userId: string; password: string }) => {
      const { error } = await supabase.rpc('admin_reset_password', { p_user: userId, p_password: password })
      if (error) throw error
    },
  })
}

/** Contraseña temporal fácil de dictar: "surdo-caixa-4821" */
export function tempPassword() {
  const words = ['surdo', 'caixa', 'repique', 'tamborim', 'agogo', 'timbal', 'chocalho', 'ganza', 'samba', 'bloco']
  const n = new Uint32Array(3)
  crypto.getRandomValues(n)
  return `${words[n[0] % words.length]}-${words[n[1] % words.length]}-${1000 + (n[2] % 9000)}`
}

/**
 * Borra una cuenta (la propia o, si es admin, cualquiera). Primero borra sus
 * archivos por la API de Storage (desde SQL no se puede) y luego la cuenta.
 */
export async function deleteAccount(userId: string) {
  const { data: files, error } = await supabase.rpc('account_files', { p_user: userId })
  if (error) throw error
  if (files?.length) {
    const { error: e2 } = await supabase.storage.from('wall').remove(files)
    if (e2) throw e2
  }
  // Puede no tener avatar: si no existe, Storage no da error
  await supabase.storage.from('avatars').remove([`${userId}/avatar.jpg`])
  const { error: e3 } = await supabase.rpc('delete_account', { p_user: userId })
  if (e3) throw e3
}

export function useDeleteAccount() {
  const invalidate = useInvalidateAdmin()
  return useMutation({ mutationFn: deleteAccount, onSuccess: invalidate })
}
