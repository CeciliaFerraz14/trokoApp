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

const toEmailMap = (rows: { id: string; email: string }[]) => new Map(Array.isArray(rows) ? rows.map((r) => [r.id, r.email]) : [])

/** Emails de todas las cuentas (solo admin) como mapa id → email */
export function useUserEmails() {
  return useQuery({
    queryKey: ['admin', 'emails'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_emails')
      if (error) throw error
      return data ?? []
    },
    // El Map se crea al leer: la caché se guarda en IndexedDB como JSON y un Map se perdería
    select: toEmailMap,
    staleTime: 5 * 60_000,
  })
}

/** Usuarios de Instagram de quien acepta que le etiqueten (solo admin) */
export function useInstagramUsernames() {
  return useQuery({
    queryKey: ['admin', 'instagram'],
    queryFn: async () => {
      // Sin permiso solo se ve el propio: también se descarta
      const { data, error } = await supabase.from('instagram').select('user_id, username').eq('tag_consent', true)
      if (error) throw error
      return data
    },
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
    // Sin esperar: la tarjeta de la cuenta desaparece al refrescar y su aviso no llegaría a verse
    onSuccess: () => void invalidate(),
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
  const { data: chatFiles, error: e4 } = await supabase.rpc('account_chat_files', { p_user: userId })
  if (e4) throw e4
  if (chatFiles?.length) {
    const { error: e5 } = await supabase.storage.from('chat').remove(chatFiles)
    if (e5) throw e5
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

// ---------------------------------------------------------------------------
// Solicitudes para entrar en grupos (las resuelve un admin)
// ---------------------------------------------------------------------------

export interface JoinRequestRow {
  group_id: string
  user_id: string
  created_at: string
  profile: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'> | null
  group: Pick<Group, 'id' | 'name' | 'color'> | null
}

export function useJoinRequests({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['join-requests', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('group_join_requests')
        .select('group_id, user_id, created_at, profile:profiles(id, full_name, nickname, avatar_url), group:groups(id, name, color)')
        .eq('status', 'pending')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as JoinRequestRow[]
    },
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  })
}

export function useResolveJoinRequest() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ groupId, userId, accept }: { groupId: string; userId: string; accept: boolean }) => {
      const { error } = await supabase.rpc('resolve_group_request', { p_group: groupId, p_user: userId, p_accept: accept })
      if (error) throw error
    },
    // Sin esperar al refresco: si no, la tarjeta desaparece de la lista antes de
    // que corra el onSuccess de quien llama (y su aviso "Aceptada" no se ve)
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['join-requests'] })
      void qc.invalidateQueries({ queryKey: ['admin'] })
      void qc.invalidateQueries({ queryKey: ['group-members'] })
    },
  })
}

/**
 * Guarda el orden de los grupos tal como queda en la lista (10, 20, 30…).
 * Solo escribe los que cambian y actualiza la lista al momento.
 */
export function useReorderGroups() {
  const qc = useQueryClient()
  const target = (ordered: Group[]) => ordered.map((g, i) => ({ id: g.id, sort_order: (i + 1) * 10 }))
  return useMutation({
    mutationFn: async (ordered: Group[]) => {
      const changes = target(ordered).filter((t, i) => ordered[i].sort_order !== t.sort_order)
      const results = await Promise.all(changes.map((c) => supabase.from('groups').update({ sort_order: c.sort_order }).eq('id', c.id)))
      const failed = results.find((r) => r.error)
      if (failed?.error) throw failed.error
    },
    onMutate: async (ordered) => {
      await qc.cancelQueries({ queryKey: ['groups'] })
      const order = new Map(target(ordered).map((t) => [t.id, t.sort_order]))
      qc.setQueriesData<Group[]>({ queryKey: ['groups'] }, (list) =>
        list
          ?.map((g) => (order.has(g.id) ? { ...g, sort_order: order.get(g.id)! } : g))
          .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'es')),
      )
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['groups'] })
      void qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
