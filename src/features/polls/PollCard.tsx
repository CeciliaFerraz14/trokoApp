import { useState } from 'react'
import { BarChart3, Check, Lock, LockOpen, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { Avatar } from '@/components/ui/Avatar'
import { Switch } from '@/components/ui/Switch'
import { TextField } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import { useOpenProfile } from '@/features/profile/ProfileSheet'
import { useClosePoll, usePoll, useVote, type PollDraft, type PollItem, type PollParent } from './api'

/** Encuesta de un aviso o de un mensaje: la carga y la enseña (nada si no tiene) */
export function PollFor({ parent, compact }: { parent: PollParent; compact?: boolean }) {
  const poll = usePoll(parent)
  if (!poll.data) return null
  return <PollCard poll={poll.data} compact={compact} />
}

/** Votar, ver resultados y quién ha votado qué */
export function PollCard({ poll, compact }: { poll: PollItem; compact?: boolean }) {
  const { data: me } = useMe()
  const vote = useVote()
  const close = useClosePoll()
  const toast = useToast()
  const openProfile = useOpenProfile()
  const [showVoters, setShowVoters] = useState(false)

  const myId = me?.profile.id
  const closed = !!poll.closed_at
  const voters = new Set(poll.votes.map((v) => v.user_id))
  const canClose = poll.created_by === myId || !!me?.isAdmin

  const toggle = (option: number) => {
    if (closed || vote.isPending) return
    const mine = poll.votes.some((v) => v.option === option && v.user_id === myId)
    vote.mutate({ poll, option, on: !mine }, { onError: (e) => toast(errorMessage(e), 'error') })
  }

  return (
    <div className={cn('space-y-3 text-fg', compact ? 'rounded-2xl bg-surface-2 p-3' : 'rounded-[1.4rem] border border-line bg-surface p-4')}>
      <div className="flex items-start gap-2">
        <BarChart3 className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg leading-snug font-semibold break-words">{poll.question}</p>
          <p className="text-sm text-muted">
            {closed ? 'Encuesta cerrada' : poll.multiple ? 'Puedes elegir varias respuestas' : 'Elige una respuesta'}
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {poll.options.map((label, i) => {
          const votes = poll.votes.filter((v) => v.option === i)
          const mine = votes.some((v) => v.user_id === myId)
          const pct = voters.size ? Math.round((votes.length / voters.size) * 100) : 0
          return (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                disabled={closed}
                aria-pressed={mine}
                className={cn(
                  'relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-xl border px-3 text-left transition-colors disabled:cursor-default',
                  mine ? 'border-brand-blue' : 'border-line',
                  !closed && 'hover:border-brand-blue',
                )}
              >
                {/* Barra con el porcentaje de votos */}
                <span aria-hidden className="absolute inset-y-0 left-0 bg-brand-blue/25 transition-all" style={{ width: `${pct}%` }} />
                <span
                  aria-hidden
                  className={cn(
                    'relative grid size-6 shrink-0 place-items-center border-2',
                    poll.multiple ? 'rounded-md' : 'rounded-full',
                    mine ? 'border-brand-blue bg-brand-blue text-brand-black' : 'border-muted',
                  )}
                >
                  {mine && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="relative min-w-0 flex-1 py-2 font-semibold break-words">{label}</span>
                <span className="relative shrink-0 text-sm font-bold">{votes.length}</span>
              </button>
              {showVoters && votes.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-1">
                  {votes.map((v) =>
                    v.voter ? (
                      <li key={v.user_id}>
                        <button
                          type="button"
                          onClick={() => openProfile(v.voter!)}
                          className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-0.5 pr-2.5 pl-0.5 text-sm"
                        >
                          <Avatar name={v.voter.full_name} url={v.voter.avatar_url} size="sm" className="size-6 text-[0.6rem]" />
                          {displayName(v.voter)}
                        </button>
                      </li>
                    ) : null,
                  )}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="text-muted">{voters.size === 1 ? '1 persona ha votado' : `${voters.size} personas han votado`}</span>
        {voters.size > 0 && (
          <button type="button" onClick={() => setShowVoters(!showVoters)} className="font-semibold text-accent">
            {showVoters ? 'Ocultar quién' : 'Ver quién'}
          </button>
        )}
        {canClose && (
          <button
            type="button"
            disabled={close.isPending}
            onClick={() =>
              (closed || confirm('¿Cerrar la encuesta? Ya no se podrá votar (puedes reabrirla).')) &&
              close.mutate({ poll, close: !closed }, { onError: (e) => toast(errorMessage(e), 'error') })
            }
            className="ml-auto inline-flex items-center gap-1 font-semibold text-muted hover:text-fg"
          >
            {closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            {closed ? 'Reabrir' : 'Cerrar'}
          </button>
        )}
      </div>
    </div>
  )
}

/** Campos para crear una encuesta: pregunta, respuestas (2–10) y voto múltiple */
export function PollEditor({ value, onChange }: { value: PollDraft; onChange: (d: PollDraft) => void }) {
  const setOption = (i: number, text: string) => onChange({ ...value, options: value.options.map((o, j) => (j === i ? text : o)) })
  return (
    <div className="space-y-3">
      <TextField label="Pregunta" maxLength={200} placeholder="¿Quién viene al bolo del sábado?" value={value.question} onChange={(e) => onChange({ ...value, question: e.target.value })} />
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-muted">Respuestas</legend>
        {value.options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <TextField
              label={`Respuesta ${i + 1}`}
              className="flex-1 [&_label]:sr-only"
              maxLength={80}
              placeholder={['Voy', 'No puedo', 'Quizá'][i] ?? `Respuesta ${i + 1}`}
              value={o}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {value.options.length > 2 && (
              <button
                type="button"
                aria-label={`Quitar respuesta ${i + 1}`}
                onClick={() => onChange({ ...value, options: value.options.filter((_, j) => j !== i) })}
                className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
              >
                <X className="size-5" />
              </button>
            )}
          </div>
        ))}
        {value.options.length < 10 && (
          <button
            type="button"
            onClick={() => onChange({ ...value, options: [...value.options, ''] })}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent"
          >
            <Plus className="size-4" /> Añadir respuesta
          </button>
        )}
      </fieldset>
      <Switch label="Varias respuestas" hint="Cada persona puede marcar más de una." checked={value.multiple} onChange={(multiple) => onChange({ ...value, multiple })} />
    </div>
  )
}
