// Tipos de la base de datos. Escritos a mano siguiendo supabase/migrations.
// Cuando tengas la CLI de Supabase puedes regenerarlos con:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type AppRole = 'admin' | 'member'
export type AccountStatus = 'pending' | 'active' | 'rejected'
export type GroupRole = 'member' | 'coordinator'
export type EventCategory = 'class' | 'no_class' | 'event' | 'workshop' | 'gig' | 'festival' | 'social' | 'other'
export type AttendanceStatus = 'yes' | 'maybe' | 'no'
export type LibrarySection = 'guide' | 'music' | 'video'
export type MerchOrderStatus = 'pending' | 'ready' | 'delivered' | 'cancelled'

export type Profile = {
  id: string
  full_name: string
  nickname: string | null
  avatar_url: string | null
  instruments: string[]
  role: AppRole
  status: AccountStatus
  approved_at: string | null
  created_at: string
  updated_at: string
}

export type Group = {
  id: string
  name: string
  description: string | null
  color: string
  sort_order: number
  schedule: string | null
  archived_at: string | null
  created_at: string
  updated_at: string
}

export type GroupMember = {
  group_id: string
  user_id: string
  role: GroupRole
  created_at: string
}

export type GroupInviteCode = {
  group_id: string
  code: string
  updated_at: string
}

export type Announcement = {
  id: string
  author_id: string | null
  title: string
  body: string
  /** Vacío = aviso general para toda la batucada */
  group_ids: string[]
  important: boolean
  pinned: boolean
  /** Enlace (vídeo, Spotify…), como en el muro */
  link_url: string | null
  created_at: string
  updated_at: string
  edited_at: string | null
  /** Felicitación automática: de quién es el cumpleaños y qué día (la crea la base de datos) */
  birthday_of: string | null
  birthday_on: string | null
}

/** Fecha de nacimiento: solo la ve su dueño/a */
export type Birthday = {
  user_id: string
  birth_date: string
  /** Compartir el cumpleaños con sus grupos (felicitación en Avisos y notificación) */
  share: boolean
  updated_at: string
}

/** Usuario de Instagram: lo ve su dueño/a y, si da permiso para etiquetarle, los admins */
export type Instagram = {
  user_id: string
  /** Sin @, en minúsculas */
  username: string
  /** Permiso para etiquetarle en las publicaciones de Troko Bloco */
  tag_consent: boolean
  updated_at: string
}

export type AnnouncementPhoto = {
  id: string
  announcement_id: string
  /** <announcement_id>/<id>.jpg en el bucket privado "announcements" (miniatura: <id>_t.jpg) */
  path: string
  width: number
  height: number
  position: number
  created_at: string
}

export type AnnouncementRead = {
  announcement_id: string
  user_id: string
  read_at: string
}

export type CalendarEvent = {
  id: string
  created_by: string | null
  title: string
  description: string
  category: EventCategory
  location: string | null
  starts_at: string
  ends_at: string | null
  all_day: boolean
  /** Vacío = evento general para toda la batucada */
  group_ids: string[]
  /** Eventos que se repiten comparten serie */
  series_id: string | null
  cancelled: boolean
  created_at: string
  updated_at: string
}

export type EventAttendance = {
  event_id: string
  user_id: string
  status: AttendanceStatus
  updated_at: string
}

export type EventNote = {
  event_id: string
  user_id: string
  note: string
  updated_at: string
}

export type ReactionEmoji = '👏' | '❤️' | '😂' | '🥁' | '🔥'

export type Post = {
  id: string
  group_id: string
  author_id: string | null
  body: string
  /** Enlace de vídeo (YouTube, Instagram…): los vídeos no se suben */
  video_url: string | null
  created_at: string
  updated_at: string
  edited_at: string | null
}

export type PostPhoto = {
  id: string
  post_id: string
  group_id: string
  /** <group_id>/<post_id>/<id>.jpg en el bucket privado "wall" (miniatura: <id>_t.jpg) */
  path: string
  width: number
  height: number
  position: number
  created_at: string
}

export type PostComment = {
  id: string
  post_id: string
  group_id: string
  author_id: string | null
  body: string
  created_at: string
}

export type PostReaction = {
  post_id: string
  user_id: string
  group_id: string
  emoji: ReactionEmoji
  created_at: string
}

export type ChatMessage = {
  id: string
  group_id: string
  author_id: string
  body: string
  created_at: string
}

export type ChatPhoto = {
  id: string
  message_id: string
  group_id: string
  /** <group_id>/<message_id>/<id>.jpg en el bucket privado "chat" (miniatura: <id>_t.jpg) */
  path: string
  width: number
  height: number
  position: number
  created_at: string
}

export type JoinRequestStatus = 'pending' | 'rejected'

export type GroupJoinRequest = {
  group_id: string
  user_id: string
  status: JoinRequestStatus
  created_at: string
  resolved_at: string | null
}

/** Resumen del panel de admin (función admin_stats) */
/** Trokoteca: guía (texto + PDF opcional), música o vídeo (enlace) */
export type LibraryItem = {
  id: string
  section: LibrarySection
  title: string
  body: string
  link_url: string | null
  /** Solo guías: guides/<id>/<archivo>.pdf en el bucket privado "trokoteca" */
  file_path: string | null
  file_name: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type MerchProduct = {
  id: string
  name: string
  description: string
  /** En céntimos de euro */
  price_cents: number
  /** Tallas o modelos; vacío = talla única */
  sizes: string[]
  /** merch/<id>/<foto>.jpg en el bucket "trokoteca" (miniatura: <foto>_t.jpg) */
  photo_path: string | null
  available: boolean
  position: number
  created_at: string
  updated_at: string
}

export type MerchOrder = {
  id: string
  user_id: string
  product_id: string | null
  /** Copiados del producto al pedir */
  product_name: string
  unit_price_cents: number
  size: string | null
  quantity: number
  note: string
  status: MerchOrderStatus
  created_at: string
  updated_at: string
}

export type AdminStats = {
  people: { active: number; pending: number; rejected: number; admins: number }
  content: { announcements: number; events: number; posts: number; photos: number; comments: number; messages: number }
  storage: { wall_bytes: number; chat_bytes: number; avatars_bytes: number }
  database_bytes: number
}

/** Estado completo de una fecha de la serie para update_event_series */
export type EventSeriesRow = Pick<
  CalendarEvent,
  'id' | 'title' | 'description' | 'category' | 'location' | 'starts_at' | 'ends_at' | 'all_day' | 'group_ids'
>

type Rel<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name
  columns: [Col]
  isOneToOne: false
  referencedRelation: Ref
  referencedColumns: ['id']
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string }
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>
        Relationships: []
      }
      groups: {
        Row: Group
        Insert: Partial<Group> & { name: string }
        Update: Partial<Omit<Group, 'id' | 'created_at'>>
        Relationships: []
      }
      group_members: {
        Row: GroupMember
        Insert: Partial<GroupMember> & { group_id: string; user_id: string }
        Update: Partial<GroupMember>
        Relationships: [
          Rel<'group_members_group_id_fkey', 'group_id', 'groups'>,
          Rel<'group_members_user_id_fkey', 'user_id', 'profiles'>,
        ]
      }
      group_invite_codes: {
        Row: GroupInviteCode
        Insert: Partial<GroupInviteCode> & { group_id: string }
        Update: Partial<GroupInviteCode>
        Relationships: [Rel<'group_invite_codes_group_id_fkey', 'group_id', 'groups'>]
      }
      birthdays: {
        Row: Birthday
        Insert: { user_id?: string; birth_date: string; share: boolean }
        Update: Partial<Pick<Birthday, 'birth_date' | 'share'>>
        Relationships: [Rel<'birthdays_user_id_fkey', 'user_id', 'profiles'>]
      }
      instagram: {
        Row: Instagram
        Insert: { user_id?: string; username: string; tag_consent: boolean }
        Update: Partial<Pick<Instagram, 'username' | 'tag_consent'>>
        Relationships: [Rel<'instagram_user_id_fkey', 'user_id', 'profiles'>]
      }
      library_items: {
        Row: LibraryItem
        Insert: Pick<LibraryItem, 'section' | 'title'> & Partial<Pick<LibraryItem, 'id' | 'body' | 'link_url' | 'file_path' | 'file_name'>>
        Update: Partial<Pick<LibraryItem, 'title' | 'body' | 'link_url' | 'file_path' | 'file_name'>>
        Relationships: [Rel<'library_items_created_by_fkey', 'created_by', 'profiles'>]
      }
      merch_products: {
        Row: MerchProduct
        Insert: Pick<MerchProduct, 'name' | 'price_cents'> & Partial<Pick<MerchProduct, 'id' | 'description' | 'sizes' | 'photo_path' | 'available' | 'position'>>
        Update: Partial<Pick<MerchProduct, 'name' | 'description' | 'price_cents' | 'sizes' | 'photo_path' | 'available' | 'position'>>
        Relationships: []
      }
      merch_orders: {
        Row: MerchOrder
        Insert: Pick<MerchOrder, 'product_id' | 'quantity'> & Partial<Pick<MerchOrder, 'size' | 'note'>>
        Update: Partial<Pick<MerchOrder, 'status'>>
        Relationships: [
          Rel<'merch_orders_user_id_fkey', 'user_id', 'profiles'>,
          Rel<'merch_orders_product_id_fkey', 'product_id', 'merch_products'>,
        ]
      }
      announcements: {
        Row: Announcement
        Insert: Partial<Omit<Announcement, 'id' | 'author_id' | 'created_at' | 'updated_at' | 'edited_at' | 'birthday_of' | 'birthday_on'>> & { title: string }
        Update: Partial<Pick<Announcement, 'title' | 'body' | 'group_ids' | 'important' | 'pinned' | 'link_url'>>
        Relationships: [Rel<'announcements_author_id_fkey', 'author_id', 'profiles'>]
      }
      announcement_photos: {
        Row: AnnouncementPhoto
        Insert: Partial<Omit<AnnouncementPhoto, 'created_at'>> & { announcement_id: string; path: string; width: number; height: number }
        Update: Partial<Pick<AnnouncementPhoto, 'position'>>
        Relationships: [Rel<'announcement_photos_announcement_id_fkey', 'announcement_id', 'announcements'>]
      }
      announcement_reads: {
        Row: AnnouncementRead
        Insert: Partial<AnnouncementRead> & { announcement_id: string; user_id: string }
        Update: Partial<AnnouncementRead>
        Relationships: [
          Rel<'announcement_reads_announcement_id_fkey', 'announcement_id', 'announcements'>,
          Rel<'announcement_reads_user_id_fkey', 'user_id', 'profiles'>,
        ]
      }
      events: {
        Row: CalendarEvent
        Insert: Partial<Omit<CalendarEvent, 'id' | 'created_by' | 'created_at' | 'updated_at'>> & { title: string; starts_at: string }
        Update: Partial<Omit<CalendarEvent, 'id' | 'created_by' | 'created_at' | 'updated_at' | 'series_id'>>
        Relationships: [Rel<'events_created_by_fkey', 'created_by', 'profiles'>]
      }
      event_attendance: {
        Row: EventAttendance
        Insert: Partial<EventAttendance> & { event_id: string; user_id: string; status: AttendanceStatus }
        Update: Partial<EventAttendance>
        Relationships: [
          Rel<'event_attendance_event_id_fkey', 'event_id', 'events'>,
          Rel<'event_attendance_user_id_fkey', 'user_id', 'profiles'>,
        ]
      }
      event_notes: {
        Row: EventNote
        Insert: Partial<EventNote> & { event_id: string; user_id: string; note: string }
        Update: Partial<EventNote>
        Relationships: [
          Rel<'event_notes_event_id_fkey', 'event_id', 'events'>,
          Rel<'event_notes_user_id_fkey', 'user_id', 'profiles'>,
        ]
      }
      posts: {
        Row: Post
        Insert: Partial<Omit<Post, 'author_id' | 'created_at' | 'updated_at' | 'edited_at'>> & { group_id: string }
        Update: Partial<Pick<Post, 'body' | 'video_url'>>
        Relationships: [
          Rel<'posts_author_id_fkey', 'author_id', 'profiles'>,
          Rel<'posts_group_id_fkey', 'group_id', 'groups'>,
        ]
      }
      post_photos: {
        Row: PostPhoto
        Insert: Partial<Omit<PostPhoto, 'group_id' | 'created_at'>> & { post_id: string; path: string; width: number; height: number }
        Update: Partial<Pick<PostPhoto, 'position'>>
        Relationships: [Rel<'post_photos_post_id_fkey', 'post_id', 'posts'>, Rel<'post_photos_group_id_fkey', 'group_id', 'groups'>]
      }
      post_comments: {
        Row: PostComment
        Insert: { post_id: string; body: string }
        Update: Partial<Pick<PostComment, 'body'>>
        Relationships: [
          Rel<'post_comments_post_id_fkey', 'post_id', 'posts'>,
          Rel<'post_comments_author_id_fkey', 'author_id', 'profiles'>,
          Rel<'post_comments_group_id_fkey', 'group_id', 'groups'>,
        ]
      }
      post_reactions: {
        Row: PostReaction
        Insert: { post_id: string; user_id: string; emoji: ReactionEmoji }
        Update: { emoji: ReactionEmoji }
        Relationships: [
          Rel<'post_reactions_post_id_fkey', 'post_id', 'posts'>,
          Rel<'post_reactions_user_id_fkey', 'user_id', 'profiles'>,
          Rel<'post_reactions_group_id_fkey', 'group_id', 'groups'>,
        ]
      }
      chat_messages: {
        Row: ChatMessage
        Insert: { id?: string; group_id: string; body: string }
        Update: never
        Relationships: [Rel<'chat_messages_author_id_fkey', 'author_id', 'profiles'>, Rel<'chat_messages_group_id_fkey', 'group_id', 'groups'>]
      }
      chat_photos: {
        Row: ChatPhoto
        Insert: Partial<Omit<ChatPhoto, 'group_id' | 'created_at'>> & { message_id: string; path: string; width: number; height: number }
        Update: never
        Relationships: [Rel<'chat_photos_message_id_fkey', 'message_id', 'chat_messages'>, Rel<'chat_photos_group_id_fkey', 'group_id', 'groups'>]
      }
      group_join_requests: {
        Row: GroupJoinRequest
        Insert: never
        Update: never
        Relationships: [
          Rel<'group_join_requests_group_id_fkey', 'group_id', 'groups'>,
          Rel<'group_join_requests_user_id_fkey', 'user_id', 'profiles'>,
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      approve_user: { Args: { p_user: string; p_groups: string[] }; Returns: undefined }
      admin_user_emails: { Args: Record<string, never>; Returns: { id: string; email: string }[] }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      update_event_series: { Args: { p_rows: EventSeriesRow[] }; Returns: number }
      admin_stats: { Args: Record<string, never>; Returns: AdminStats }
      admin_reset_password: { Args: { p_user: string; p_password: string }; Returns: undefined }
      account_files: { Args: { p_user: string }; Returns: string[] }
      account_chat_files: { Args: { p_user: string }; Returns: string[] }
      delete_account: { Args: { p_user: string }; Returns: undefined }
      request_group_access: { Args: { p_group: string }; Returns: undefined }
      resolve_group_request: { Args: { p_group: string; p_user: string; p_accept: boolean }; Returns: undefined }
      push_public_key: { Args: Record<string, never>; Returns: string | null }
      save_push_subscription: { Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent?: string }; Returns: undefined }
      delete_push_subscription: { Args: { p_endpoint: string }; Returns: undefined }
      mark_chat_read: { Args: { p_group: string }; Returns: undefined }
      my_chat_unread: { Args: Record<string, never>; Returns: { group_id: string; unread: number }[] }
    }
    Enums: {
      app_role: AppRole
      account_status: AccountStatus
      group_role: GroupRole
      event_category: EventCategory
      attendance_status: AttendanceStatus
      join_request_status: JoinRequestStatus
      library_section: LibrarySection
      merch_order_status: MerchOrderStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
