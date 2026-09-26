// Tipos de la base de datos. Escritos a mano siguiendo supabase/migrations.
// Cuando tengas la CLI de Supabase puedes regenerarlos con:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type AppRole = 'admin' | 'member'
export type AccountStatus = 'pending' | 'active' | 'rejected'
export type GroupRole = 'member' | 'coordinator'
export type EventCategory = 'class' | 'rehearsal' | 'gig' | 'festival' | 'meeting' | 'social' | 'other'
export type AttendanceStatus = 'yes' | 'maybe' | 'no'

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
  created_at: string
  updated_at: string
  edited_at: string | null
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
      announcements: {
        Row: Announcement
        Insert: Partial<Omit<Announcement, 'id' | 'author_id' | 'created_at' | 'updated_at' | 'edited_at'>> & { title: string }
        Update: Partial<Pick<Announcement, 'title' | 'body' | 'group_ids' | 'important' | 'pinned'>>
        Relationships: [Rel<'announcements_author_id_fkey', 'author_id', 'profiles'>]
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
    }
    Views: { [_ in never]: never }
    Functions: {
      join_with_code: { Args: { p_code: string }; Returns: string }
      approve_user: { Args: { p_user: string; p_groups: string[] }; Returns: undefined }
      regenerate_invite_code: { Args: { p_group: string }; Returns: string }
      admin_user_emails: { Args: Record<string, never>; Returns: { id: string; email: string }[] }
      is_admin: { Args: Record<string, never>; Returns: boolean }
      update_event_series: { Args: { p_rows: EventSeriesRow[] }; Returns: number }
      my_calendar_token: { Args: Record<string, never>; Returns: string }
      regenerate_calendar_token: { Args: Record<string, never>; Returns: string }
    }
    Enums: {
      app_role: AppRole
      account_status: AccountStatus
      group_role: GroupRole
      event_category: EventCategory
      attendance_status: AttendanceStatus
    }
    CompositeTypes: { [_ in never]: never }
  }
}
