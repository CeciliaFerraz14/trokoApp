import { useEffect, useRef } from 'react'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/image'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Post, PostComment, PostPhoto, Profile, ReactionEmoji } from '@/types/database'

const PAGE = 15
/** Las URLs firmadas duran una semana (la caché offline también) */
const SIGNED_TTL = 60 * 60 * 24 * 7
const BUCKET = 'wall'

export type WallAuthor = Pick<Profile, 'id' | 'full_name' | 'nickname' | 'avatar_url'>

export interface WallPhoto extends Pick<PostPhoto, 'id' | 'path' | 'width' | 'height' | 'position'> {
  /** URL firmada de la miniatura (640 px) */
  thumbUrl: string | null
  /** URL firmada de la foto grande (1600 px) */
  url: string | null
}

export interface WallPost extends Post {
  author: WallAuthor | null
  photos: WallPhoto[]
  commentCount: number
  reactions: { emoji: ReactionEmoji; user_id: string }[]
}

/** Miniatura guardada junto a la foto: <id>.jpg → <id>_t.jpg */
export const thumbPath = (path: string) => path.replace(/\.jpg$/, '_t.jpg')

/** Firma rutas del bucket privado en una sola llamada */
async function signPaths(paths: string[]) {
  const urls = new Map<string, string>()
  if (!paths.length) return urls
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_TTL)
  if (error) throw error
  for (const r of data ?? []) if (r.signedUrl && r.path) urls.set(r.path, r.signedUrl)
  return urls
}

const POST_SELECT =
  '*, author:profiles!posts_author_id_fkey(id, full_name, nickname, avatar_url), ' +
  'photos:post_photos(id, path, width, height, position), comments:post_comments(count), reactions:post_reactions(emoji, user_id)'

type PostRow = Post & {
  author: WallAuthor | null
  photos: Omit<WallPhoto, 'url' | 'thumbUrl'>[]
  comments: { count: number }[]
  reactions: { emoji: ReactionEmoji; user_id: string }[]
}

async function toPosts(rows: PostRow[]): Promise<WallPost[]> {
  // Una sola foto se ve grande; varias, en cuadrícula de miniaturas
  const paths = rows.flatMap((r) => r.photos.map((p) => (r.photos.length === 1 ? p.path : thumbPath(p.path))))
  const urls = await signPaths(paths)
  return rows.map(({ comments, photos, ...post }) => ({
    ...post,
    commentCount: comments[0]?.count ?? 0,
    photos: [...photos]
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        ...p,
        url: photos.length === 1 ? (urls.get(p.path) ?? null) : null,
        thumbUrl: urls.get(photos.length === 1 ? p.path : thumbPath(p.path)) ?? null,
      })),
  }))
}

/** Publicaciones de un grupo, de más nueva a más antigua, por páginas */
export function useWall(groupId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['wall', groupId],
    queryFn: async ({ pageParam }) => {
      let q = supabase.from('posts').select(POST_SELECT).eq('group_id', groupId!).order('created_at', { ascending: false }).limit(PAGE)
      if (pageParam) q = q.lt('created_at', pageParam)
      const { data, error } = await q
      if (error) throw error
      return toPosts((data ?? []) as unknown as PostRow[])
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1].created_at : null),
    enabled: !!groupId,
  })
}

export function usePost(postId: string | undefined) {
  return useQuery({
    queryKey: ['post', postId],
    queryFn: async () => {
      const { data, error } = await supabase.from('posts').select(POST_SELECT).eq('id', postId!).maybeSingle()
      if (error) throw error
      if (!data) return null
      return (await toPosts([data as unknown as PostRow]))[0]
    },
    enabled: !!postId,
  })
}

export interface WallComment extends PostComment {
  author: WallAuthor | null
}

export function useComments(postId: string | undefined) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_comments')
        .select('*, author:profiles!post_comments_author_id_fkey(id, full_name, nickname, avatar_url)')
        .eq('post_id', postId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as unknown as WallComment[]
    },
    enabled: !!postId,
  })
}

export interface GalleryPhoto extends Pick<PostPhoto, 'id' | 'post_id' | 'path' | 'width' | 'height' | 'created_at'> {
  thumbUrl: string | null
}

/** Todas las fotos del grupo (las más nuevas primero) */
export function useGallery(groupId: string | undefined) {
  return useQuery({
    queryKey: ['gallery', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('post_photos')
        .select('id, post_id, path, width, height, created_at')
        .eq('group_id', groupId!)
        .order('created_at', { ascending: false })
        .order('position')
        .limit(300)
      if (error) throw error
      const urls = await signPaths((data ?? []).map((p) => thumbPath(p.path)))
      return (data ?? []).map((p) => ({ ...p, thumbUrl: urls.get(thumbPath(p.path)) ?? null }))
    },
    enabled: !!groupId,
  })
}

/** URL firmada de la foto grande (para el visor), bajo demanda */
export function useFullPhotoUrl(path: string | undefined, known?: string | null) {
  return useQuery({
    queryKey: ['wall-photo', path],
    queryFn: async () => (await signPaths([path!])).get(path!) ?? null,
    enabled: !!path && !known,
    initialData: known ?? undefined,
    staleTime: (SIGNED_TTL - 3600) * 1000,
  })
}

// ---------------------------------------------------------------------------
// Tiempo real: cualquier cambio del grupo refresca muro, galería y comentarios
// ---------------------------------------------------------------------------
const WALL_TABLES = ['posts', 'post_photos', 'post_comments', 'post_reactions'] as const

export function useWallRealtime(groupId: string | undefined) {
  const qc = useQueryClient()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    if (!groupId) return
    // Agrupa ráfagas (una publicación con 5 fotos son 6 eventos)
    const refresh = () => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['wall', groupId] })
        void qc.invalidateQueries({ queryKey: ['gallery', groupId] })
        void qc.invalidateQueries({ queryKey: ['post'] })
        void qc.invalidateQueries({ queryKey: ['comments'] })
        void qc.invalidateQueries({ queryKey: ['wall-news'] })
      }, 400)
    }
    const channel = supabase.channel(`wall:${groupId}`)
    for (const table of WALL_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `group_id=eq.${groupId}` }, refresh)
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [groupId, qc])
}

// ---------------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------------

function useInvalidateWall() {
  const qc = useQueryClient()
  return (groupId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['wall', groupId] }),
      qc.invalidateQueries({ queryKey: ['gallery', groupId] }),
      qc.invalidateQueries({ queryKey: ['post'] }),
      qc.invalidateQueries({ queryKey: ['comments'] }),
    ])
}

export const MAX_PHOTOS = 6

/**
 * Publica: comprime y sube las fotos (grande + miniatura) a la carpeta de la
 * publicación, crea la publicación y registra las fotos. Si algo falla, se
 * deshace lo subido para no dejar archivos huérfanos.
 */
export function useCreatePost() {
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async ({
      groupId,
      body,
      videoUrl,
      files,
      onProgress,
    }: {
      groupId: string
      body: string
      videoUrl: string | null
      files: File[]
      onProgress?: (done: number, total: number) => void
    }) => {
      const postId = crypto.randomUUID()
      const uploaded: string[] = []
      const photos: { id: string; path: string; width: number; height: number; position: number }[] = []
      let postCreated = false
      try {
        for (const [i, file] of files.entries()) {
          onProgress?.(i, files.length)
          const id = crypto.randomUUID()
          const path = `${groupId}/${postId}/${id}.jpg`
          const full = await compressImage(file, { maxSize: 1600, quality: 0.8 })
          const thumb = await compressImage(file, { maxSize: 640, quality: 0.75 })
          for (const [p, blob] of [
            [path, full.blob],
            [thumbPath(path), thumb.blob],
          ] as const) {
            const { error } = await supabase.storage.from(BUCKET).upload(p, blob, { contentType: 'image/jpeg' })
            if (error) throw error
            uploaded.push(p)
          }
          photos.push({ id, path, width: full.width, height: full.height, position: i })
        }
        onProgress?.(files.length, files.length)

        const { error } = await supabase.from('posts').insert({ id: postId, group_id: groupId, body: body.trim(), video_url: videoUrl })
        if (error) throw error
        postCreated = true
        if (photos.length) {
          const { error: e2 } = await supabase.from('post_photos').insert(photos.map((p) => ({ ...p, post_id: postId })))
          if (e2) throw e2
        }
        return postId
      } catch (err) {
        if (postCreated) await supabase.from('posts').delete().eq('id', postId)
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded)
        throw err
      }
    },
    onSuccess: (_id, { groupId }) => invalidate(groupId),
  })
}

export function useUpdatePost() {
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async ({ post, body, videoUrl }: { post: Post; body: string; videoUrl: string | null }) => {
      const { error } = await supabase.from('posts').update({ body: body.trim(), video_url: videoUrl }).eq('id', post.id)
      if (error) throw error
    },
    onSuccess: (_d, { post }) => invalidate(post.group_id),
  })
}

/** Borra la publicación y sus archivos (las filas de fotos, comentarios y reacciones van en cascada) */
export function useDeletePost() {
  const qc = useQueryClient()
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async (post: Pick<WallPost, 'id' | 'group_id' | 'photos'>) => {
      const { data, error } = await supabase.from('posts').delete().eq('id', post.id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para borrar esta publicación.')
      const files = post.photos.flatMap((p) => [p.path, thumbPath(p.path)])
      // Si fallara, quedan archivos sin publicación pero nadie puede llegar a ellos
      if (files.length) await supabase.storage.from(BUCKET).remove(files)
    },
    onSuccess: (_d, post) => {
      qc.removeQueries({ queryKey: ['post', post.id] })
      return invalidate(post.group_id)
    },
  })
}

export function useAddComment() {
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async ({ postId, body }: { postId: string; groupId: string; body: string }) => {
      const { error } = await supabase.from('post_comments').insert({ post_id: postId, body: body.trim() })
      if (error) throw error
    },
    onSuccess: (_d, { groupId }) => invalidate(groupId),
  })
}

export function useDeleteComment() {
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async ({ id }: { id: string; groupId: string }) => {
      const { data, error } = await supabase.from('post_comments').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('No tienes permiso para borrar este comentario.')
    },
    onSuccess: (_d, { groupId }) => invalidate(groupId),
  })
}

/** Mi reacción: emoji = null → quitarla */
export function useReact() {
  const { session } = useAuth()
  const userId = session?.user.id
  const invalidate = useInvalidateWall()
  return useMutation({
    mutationFn: async ({ postId, emoji }: { postId: string; groupId: string; emoji: ReactionEmoji | null }) => {
      const { error } =
        emoji === null
          ? await supabase.from('post_reactions').delete().eq('post_id', postId).eq('user_id', userId!)
          : await supabase.from('post_reactions').upsert({ post_id: postId, user_id: userId!, emoji }, { onConflict: 'post_id,user_id' })
      if (error) throw error
    },
    onSuccess: (_d, { groupId }) => invalidate(groupId),
  })
}
