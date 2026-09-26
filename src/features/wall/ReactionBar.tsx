import { useState } from 'react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import type { ReactionEmoji } from '@/types/database'
import { useReact, type WallPost } from './api'

export const EMOJIS: ReactionEmoji[] = ['👏', '❤️', '😂', '🥁', '🔥']

/** Una reacción por persona; pulsar la tuya la quita, pulsar otra la cambia */
export function ReactionBar({ post }: { post: WallPost }) {
  const { session } = useAuth()
  const me = session?.user.id
  const react = useReact()
  const toast = useToast()
  // Respuesta optimista mientras se guarda (undefined = sin cambios pendientes)
  const [pending, setPending] = useState<ReactionEmoji | null | undefined>(undefined)

  const saved = post.reactions.find((r) => r.user_id === me)?.emoji ?? null
  const mine = pending === undefined ? saved : pending
  const counts = new Map<ReactionEmoji, number>()
  for (const r of post.reactions) if (r.user_id !== me) counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)
  if (mine) counts.set(mine, (counts.get(mine) ?? 0) + 1)

  const choose = (emoji: ReactionEmoji) => {
    const next = mine === emoji ? null : emoji
    setPending(next)
    react.mutate(
      { postId: post.id, groupId: post.group_id, emoji: next },
      { onError: (e) => toast(errorMessage(e), 'error'), onSettled: () => setPending(undefined) },
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Reacciones">
      {EMOJIS.map((e) => {
        const n = counts.get(e) ?? 0
        const on = mine === e
        return (
          <button
            key={e}
            type="button"
            aria-pressed={on}
            aria-label={`${e}${n ? `, ${n}` : ''}`}
            onClick={() => choose(e)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-base transition-colors',
              on ? 'border-brand-blue bg-brand-blue/20' : 'border-line bg-surface-2 hover:border-brand-blue',
              !n && !on && 'opacity-70',
            )}
          >
            <span aria-hidden>{e}</span>
            {n > 0 && <span className="text-sm font-bold">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}
