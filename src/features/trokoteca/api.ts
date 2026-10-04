// Trokoteca: guías, música, vídeos y merchandising. Solo los admins publican.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { removePhotoFiles, signPaths, thumbPath, uploadPhotos, SIGNED_TTL } from '@/lib/photos'
import { useAuth } from '@/features/auth/AuthProvider'
import type { LibraryItem, LibrarySection, MerchOrder, MerchOrderStatus, MerchProduct, Profile } from '@/types/database'

const BUCKET = 'trokoteca'
/** Límite del bucket (10 MB) */
export const MAX_PDF_BYTES = 10 * 1024 * 1024

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100)

// ---------------------------------------------------------------------------
// Guías, música y vídeos
// ---------------------------------------------------------------------------

export function useLibrary(section: LibrarySection) {
  return useQuery({
    queryKey: ['trokoteca', 'items', section],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('library_items')
        .select('*')
        .eq('section', section)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useLibraryItem(id: string | undefined) {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['trokoteca', 'item', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('library_items').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!id,
    // Mientras carga, lo que ya haya en la lista de su sección
    placeholderData: () =>
      qc
        .getQueriesData<LibraryItem[]>({ queryKey: ['trokoteca', 'items'] })
        .flatMap(([, list]) => list ?? [])
        .find((i) => i.id === id),
  })
}

/** URL firmada del PDF de una guía (dura lo mismo que las fotos) */
export function useFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['trokoteca', 'file', path],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path!, SIGNED_TTL)
      if (error) throw error
      return data.signedUrl
    },
    enabled: !!path,
    staleTime: (SIGNED_TTL / 2) * 1000,
  })
}

/** Nombre de archivo seguro para la ruta (el original se guarda aparte) */
const safeFileName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\.pdf$/i, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'guia'

export interface LibraryItemInput {
  id?: string
  section: LibrarySection
  title: string
  body: string
  link_url: string | null
  /** Solo guías: PDF nuevo (sustituye al anterior) */
  pdf?: File | null
  /** Solo guías: quitar el PDF que tenía */
  removePdf?: boolean
}

export function useSaveLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, section, title, body, link_url, pdf, removePdf }: LibraryItemInput) => {
      let item: LibraryItem
      if (id) {
        const { data, error } = await supabase.from('library_items').update({ title, body, link_url }).eq('id', id).select().single()
        if (error) throw error
        item = data
      } else {
        const { data, error } = await supabase.from('library_items').insert({ section, title, body, link_url }).select().single()
        if (error) throw error
        item = data
      }

      const oldPath = item.file_path
      if (pdf) {
        const path = `guides/${item.id}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(pdf.name)}.pdf`
        const { error: upError } = await supabase.storage.from(BUCKET).upload(path, pdf, { contentType: 'application/pdf' })
        if (upError) throw upError
        const { data, error } = await supabase
          .from('library_items')
          .update({ file_path: path, file_name: pdf.name.slice(0, 200) })
          .eq('id', item.id)
          .select()
          .single()
        if (error) {
          await supabase.storage.from(BUCKET).remove([path])
          throw error
        }
        item = data
        if (oldPath) await supabase.storage.from(BUCKET).remove([oldPath])
      } else if (removePdf && oldPath) {
        const { data, error } = await supabase.from('library_items').update({ file_path: null }).eq('id', item.id).select().single()
        if (error) throw error
        item = data
        await supabase.storage.from(BUCKET).remove([oldPath])
      }
      return item
    },
    onSuccess: (item) => {
      qc.setQueryData(['trokoteca', 'item', item.id], item)
      void qc.invalidateQueries({ queryKey: ['trokoteca', 'items', item.section] })
    },
  })
}

export function useDeleteLibraryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (item: Pick<LibraryItem, 'id' | 'file_path'>) => {
      if (item.file_path) await supabase.storage.from(BUCKET).remove([item.file_path])
      const { error } = await supabase.from('library_items').delete().eq('id', item.id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trokoteca', 'items'] }),
  })
}

// ---------------------------------------------------------------------------
// Merchandising: productos
// ---------------------------------------------------------------------------

/** Producto con las URLs firmadas de su foto */
export type ProductWithPhoto = MerchProduct & { thumbUrl: string | null; photoUrl: string | null }

async function withPhotos(products: MerchProduct[]): Promise<ProductWithPhoto[]> {
  const paths = products.flatMap((p) => (p.photo_path ? [p.photo_path, thumbPath(p.photo_path)] : []))
  const urls = await signPaths(BUCKET, paths)
  return products.map((p) => ({
    ...p,
    photoUrl: p.photo_path ? (urls.get(p.photo_path) ?? null) : null,
    thumbUrl: p.photo_path ? (urls.get(thumbPath(p.photo_path)) ?? null) : null,
  }))
}

export function useMerchProducts() {
  return useQuery({
    queryKey: ['trokoteca', 'products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_products')
        .select('*')
        .order('position')
        .order('created_at', { ascending: false })
      if (error) throw error
      return withPhotos(data)
    },
    staleTime: (SIGNED_TTL / 2) * 1000,
  })
}

export function useMerchProduct(id: string | undefined) {
  const products = useMerchProducts()
  return { ...products, data: products.data?.find((p) => p.id === id) }
}

export interface ProductInput {
  id?: string
  name: string
  description: string
  price_cents: number
  sizes: string[]
  available: boolean
  /** Foto nueva (sustituye a la anterior) */
  photo?: File | null
  removePhoto?: boolean
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, photo, removePhoto, ...fields }: ProductInput) => {
      let product: MerchProduct
      if (id) {
        const { data, error } = await supabase.from('merch_products').update(fields).eq('id', id).select().single()
        if (error) throw error
        product = data
      } else {
        const { data, error } = await supabase.from('merch_products').insert(fields).select().single()
        if (error) throw error
        product = data
      }

      const oldPath = product.photo_path
      if (photo) {
        const { photos, uploaded } = await uploadPhotos(BUCKET, `merch/${product.id}`, [photo])
        const { data, error } = await supabase
          .from('merch_products')
          .update({ photo_path: photos[0].path })
          .eq('id', product.id)
          .select()
          .single()
        if (error) {
          await supabase.storage.from(BUCKET).remove(uploaded)
          throw error
        }
        product = data
        if (oldPath) await removePhotoFiles(BUCKET, [{ path: oldPath }])
      } else if (removePhoto && oldPath) {
        const { data, error } = await supabase.from('merch_products').update({ photo_path: null }).eq('id', product.id).select().single()
        if (error) throw error
        product = data
        await removePhotoFiles(BUCKET, [{ path: oldPath }])
      }
      return product
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trokoteca', 'products'] }),
  })
}

export function useDeleteProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (product: Pick<MerchProduct, 'id' | 'photo_path'>) => {
      if (product.photo_path) await removePhotoFiles(BUCKET, [{ path: product.photo_path }])
      const { error } = await supabase.from('merch_products').delete().eq('id', product.id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['trokoteca', 'products'] })
      void qc.invalidateQueries({ queryKey: ['trokoteca', 'orders'] })
    },
  })
}

// ---------------------------------------------------------------------------
// Merchandising: pedidos
// ---------------------------------------------------------------------------

export const ORDER_STATUS: Record<MerchOrderStatus, { label: string; tone: 'warning' | 'brand' | 'success' | 'neutral' }> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  ready: { label: 'Listo para recoger', tone: 'brand' },
  delivered: { label: 'Entregado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}

export function useMyOrders() {
  const { session } = useAuth()
  const userId = session?.user.id
  return useQuery({
    queryKey: ['trokoteca', 'orders', 'mine', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_orders')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!userId,
  })
}

export type OrderWithPerson = MerchOrder & { person: Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'> | null }

/** Todos los pedidos (solo admins) */
export function useAllOrders({ enabled = true } = {}) {
  return useQuery({
    queryKey: ['trokoteca', 'orders', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('merch_orders')
        .select('*, person:profiles!merch_orders_user_id_fkey(id, full_name, nickname, avatar_url)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as OrderWithPerson[]
    },
    enabled,
  })
}

export function usePlaceOrder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (order: { product_id: string; size: string | null; quantity: number; note: string }) => {
      const { error } = await supabase.from('merch_orders').insert(order)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trokoteca', 'orders'] }),
  })
}

export function useSetOrderStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: MerchOrderStatus }) => {
      const { error } = await supabase.from('merch_orders').update({ status }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['trokoteca', 'orders'] }),
  })
}
