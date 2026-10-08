import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { format, isSameDay } from 'date-fns'
import { BarChart3, ImagePlus, Lock, MessagesSquare, SendHorizontal, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPastDay } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MAX_PHOTOS } from '@/lib/photos'
import { useKeyboardInset } from '@/lib/viewport'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/Field'
import { Linkify } from '@/components/ui/Linkify'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName, useGroupMembers } from '@/features/groups/api'
import { JoinRequestButton } from '@/features/groups/JoinRequestButton'
import { useOpenProfile } from '@/features/profile/ProfileSheet'
import { PhotoGrid } from '@/features/wall/PhotoGrid'
import { EMOJIS } from '@/features/wall/ReactionBar'
import { PollEditor, PollFor } from '@/features/polls/PollCard'
import { emptyPoll, pollDraftError, type PollDraft } from '@/features/polls/api'
import type { ReactionEmoji } from '@/types/database'
import { useChat, useChatReact, useChatRealtime, useDeleteMessage, useSendMessage, type ChatItem } from './api'
import { useMarkChatRead } from './unread'

/** Chat del grupo: escribe cualquier persona del grupo (texto, enlaces y fotos) */
export function ChatPanel({ groupId, groupName }: { groupId: string; groupName: string }) {
  const { data: me } = useMe()
  const isMember = !!me && (me.isAdmin || me.memberships.some((m) => m.group.id === groupId))
  if (!isMember) {
    return (
      <EmptyState icon={<Lock className="size-8" />} title="Aún no estás en este grupo" action={<JoinRequestButton groupId={groupId} groupName={groupName} />}>
        El chat solo lo ven las personas de {groupName}. Pide entrar y un admin revisará tu solicitud.
      </EmptyState>
    )
  }
  return <Chat groupId={groupId} />
}

function Chat({ groupId }: { groupId: string }) {
  const { data: me } = useMe()
  const chat = useChat(groupId)
  const remove = useDeleteMessage()
  const react = useChatReact()
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  // Para las menciones: nombre visible de cada persona del grupo
  const members = useGroupMembers(groupId)
  const people = useMemo(
    () => (members.data ?? []).map(({ profile }) => ({ id: profile.id, name: displayName(profile) })),
    [members.data],
  )
  const nameOf = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people])
  // Alto de la caja de escribir (fija abajo): se deja ese hueco al final de la lista
  const [composerHeight, setComposerHeight] = useState(0)
  useChatRealtime(groupId)

  // Las páginas llegan del más nuevo al más antiguo; se muestran al revés
  const messages = useMemo(() => (chat.data?.pages.flat() ?? []).slice().reverse(), [chat.data])

  // Al abrir y con cada mensaje nuevo, baja hasta el final (cargar anteriores no mueve nada)
  const newest = messages[messages.length - 1]?.id
  useMarkChatRead(groupId, newest)
  const scrolled = useRef(false)
  useEffect(() => {
    if (!newest || !composerHeight) return
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrolled.current ? 'smooth' : 'instant' })
    scrolled.current = true
  }, [newest, composerHeight])

  // Si se estaba al final, se sigue al final cuando la pantalla encoge (al abrir el teclado)
  useEffect(() => {
    const root = document.documentElement
    let atEnd = true
    const onScroll = () => {
      atEnd = root.scrollHeight - window.scrollY - window.innerHeight < 80
    }
    const onResize = () => {
      if (atEnd) window.scrollTo({ top: root.scrollHeight })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)
    window.visualViewport?.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      window.visualViewport?.removeEventListener('resize', onResize)
    }
  }, [])

  const onDelete = (m: ChatItem) => {
    if (!confirm('¿Borrar este mensaje?')) return
    remove.mutate(m, {
      onSuccess: () => setSelected(null),
      onError: (e) => toast(errorMessage(e), 'error'),
    })
  }

  return (
    <div className="space-y-3" style={{ paddingBottom: composerHeight + 12 }}>
      {chat.isPending ? (
        <SkeletonList count={4} className="h-14" />
      ) : chat.isError ? (
        <ErrorState error={chat.error} onRetry={() => chat.refetch()} />
      ) : !messages.length ? (
        <EmptyState icon={<MessagesSquare className="size-8" />} title="Todavía no hay mensajes">
          Escribe el primero: una pregunta, una foto, un enlace…
        </EmptyState>
      ) : (
        <>
          {chat.hasNextPage && (
            <Button variant="secondary" block loading={chat.isFetchingNextPage} onClick={() => chat.fetchNextPage()}>
              Ver mensajes anteriores
            </Button>
          )}
          <ol aria-label="Mensajes">
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const newDay = !prev || !isSameDay(prev.created_at, m.created_at)
              return (
                <li key={m.id}>
                  {newDay && (
                    <p className="my-3 text-center">
                      <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-semibold text-muted">{formatPastDay(m.created_at)}</span>
                    </p>
                  )}
                  <Message
                    message={m}
                    mine={m.author_id === me?.profile.id}
                    first={newDay || prev.author_id !== m.author_id}
                    canDelete={m.author_id === me?.profile.id || !!me?.canManageGroup(groupId)}
                    selected={selected === m.id}
                    onSelect={() => setSelected(selected === m.id ? null : m.id)}
                    onDelete={() => onDelete(m)}
                    deleting={remove.isPending}
                    myId={me?.profile.id}
                    mentionWords={m.mentions.flatMap((id) => (nameOf.has(id) ? [`@${nameOf.get(id)}`] : []))}
                    onReact={(emoji) => {
                      setSelected(null)
                      react.mutate({ messageId: m.id, groupId, emoji }, { onError: (e) => toast(errorMessage(e), 'error') })
                    }}
                  />
                </li>
              )
            })}
          </ol>
        </>
      )}
      <Composer groupId={groupId} people={people.filter((p) => p.id !== me?.profile.id)} onHeight={setComposerHeight} />
    </div>
  )
}

function Message({
  message: m,
  mine,
  first,
  canDelete,
  selected,
  onSelect,
  onDelete,
  deleting,
  myId,
  mentionWords,
  onReact,
}: {
  message: ChatItem
  mine: boolean
  /** Primer mensaje seguido de esta persona: lleva nombre y foto */
  first: boolean
  canDelete: boolean
  selected: boolean
  onSelect: () => void
  onDelete: () => void
  deleting: boolean
  myId: string | undefined
  /** "@Nombre" de las personas mencionadas, para resaltarlas */
  mentionWords: string[]
  onReact: (emoji: ReactionEmoji | null) => void
}) {
  const time = format(new Date(m.created_at), 'H:mm')
  const openProfile = useOpenProfile()
  const author = m.author
  // Tocar el mensaje muestra las reacciones (y "Borrar"), salvo al tocar un enlace, una foto o la encuesta
  const onClick = (e: MouseEvent) => {
    if (!(e.target as HTMLElement).closest('a, button')) onSelect()
  }
  const reactions = m.reactions ?? []
  const myReaction = reactions.find((r) => r.user_id === myId)?.emoji ?? null
  const counts = EMOJIS.map((e) => [e, reactions.filter((r) => r.emoji === e).length] as const).filter(([, n]) => n > 0)

  return (
    <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-1')}>
      {!mine &&
        (first ? (
          // La foto abre su ficha (si la cuenta sigue existiendo)
          author ? (
            <button type="button" onClick={() => openProfile(author)} aria-label={`Ver el perfil de ${displayName(author)}`} className="shrink-0 rounded-full">
              <Avatar name={author.full_name} url={author.avatar_url} size="sm" />
            </button>
          ) : (
            <Avatar name="?" size="sm" />
          )
        ) : (
          <span className="w-9 shrink-0" aria-hidden />
        ))}
      <div className={cn('flex max-w-[80%] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
        <div
          onClick={onClick}
          className={cn(
            'min-w-0 space-y-2 rounded-2xl px-3 py-2',
            mine ? 'rounded-br-md bg-brand-blue text-brand-black [&_a]:text-brand-black' : 'rounded-bl-md border border-line bg-surface',
            m.photos.length > 0 && 'w-64 max-w-full',
            m.hasPoll && 'w-72 max-w-full',
          )}
        >
          {!mine && first && (
            <p className="text-sm font-semibold text-accent">
              {author ? (
                <button type="button" onClick={() => openProfile(author)}>
                  {displayName(author)}
                </button>
              ) : (
                'Cuenta eliminada'
              )}
            </p>
          )}
          <PhotoGrid photos={m.photos} bucket="chat" />
          {m.hasPoll && <PollFor parent={{ messageId: m.id }} compact />}
          {m.body && <Linkify text={m.body} highlight={mentionWords} />}
          <p className={cn('text-right text-xs', mine ? 'text-brand-black/70' : 'text-muted')}>
            <button type="button" onClick={onSelect} aria-expanded={selected} aria-label={`${time}: reaccionar u otras opciones`}>
              {time}
            </button>
          </p>
        </div>
        {counts.length > 0 && (
          // Reacciones: tocar una pone o quita la mía con ese emoji
          <div className="-mt-1.5 flex flex-wrap gap-1">
            {counts.map(([e, n]) => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(myReaction === e ? null : e)}
                aria-pressed={myReaction === e}
                aria-label={`${e} ${n}${myReaction === e ? ', la tuya: tocar para quitarla' : ''}`}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2 text-sm shadow-sm',
                  myReaction === e ? 'border-brand-blue bg-brand-blue/20' : 'border-line bg-surface',
                )}
              >
                <span aria-hidden>{e}</span>
                {n > 1 && <span className="text-xs font-bold">{n}</span>}
              </button>
            ))}
          </div>
        )}
        {selected && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <div className="flex rounded-full border border-line bg-surface p-0.5 shadow-lg" role="group" aria-label="Reaccionar">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => onReact(myReaction === e ? null : e)}
                  aria-pressed={myReaction === e}
                  aria-label={`Reaccionar con ${e}`}
                  className={cn('grid size-10 place-items-center rounded-full text-xl transition-transform hover:scale-110', myReaction === e && 'bg-brand-blue/25')}
                >
                  {e}
                </button>
              ))}
            </div>
            {canDelete && (
              <Button type="button" variant="secondary" className="min-h-9 px-3 text-sm" icon={<Trash2 className="size-4" />} loading={deleting} onClick={onDelete}>
                Borrar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** Caja para escribir, fija abajo del todo (o encima del teclado) */
/** Quita tildes y mayúsculas para buscar nombres ("ines" encuentra a "Inés") */
const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

type Person = { id: string; name: string }

function Composer({ groupId, people, onHeight }: { groupId: string; people: Person[]; onHeight: (height: number) => void }) {
  const send = useSendMessage()
  const keyboard = useKeyboardInset()
  const box = useRef<HTMLFormElement>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight))
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeight])
  const toast = useToast()
  const input = useRef<HTMLInputElement>(null)
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const [pollOpen, setPollOpen] = useState(false)

  // Menciones: al escribir "@" (y unas letras) justo antes del cursor salen sugerencias
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentioned, setMentioned] = useState<Person[]>([])
  const suggestions = useMemo(() => {
    if (mentionQuery === null) return []
    const q = fold(mentionQuery)
    return people.filter((p) => fold(p.name).split(/\s+/).some((w) => w.startsWith(q)) || fold(p.name).startsWith(q)).slice(0, 5)
  }, [mentionQuery, people])

  const onType = (el: HTMLTextAreaElement) => {
    textRef.current = el
    setBody(el.value)
    const before = el.value.slice(0, el.selectionStart ?? el.value.length)
    const match = /(?:^|\s)@([\p{L}\d._-]{0,30})$/u.exec(before)
    setMentionQuery(match ? match[1] : null)
  }

  const pickMention = (person: Person) => {
    const el = textRef.current
    const caret = el?.selectionStart ?? body.length
    const start = body.slice(0, caret).lastIndexOf('@')
    const next = `${body.slice(0, start)}@${person.name} ${body.slice(caret)}`
    setBody(next)
    setMentionQuery(null)
    setMentioned((list) => (list.some((p) => p.id === person.id) ? list : [...list, person]))
    // El cursor, justo después del nombre
    requestAnimationFrame(() => {
      const pos = start + person.name.length + 2
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  // Vistas previas locales de las fotos elegidas
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files])
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews])

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const images = [...list].filter((f) => f.type.startsWith('image/'))
    if (files.length + images.length > MAX_PHOTOS) toast(`Máximo ${MAX_PHOTOS} fotos`, 'error')
    setFiles([...files, ...images].slice(0, MAX_PHOTOS))
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (send.isPending || (!body.trim() && !files.length)) return
    // Solo cuentan las menciones cuyo "@Nombre" sigue en el texto
    const mentions = mentioned.filter((p) => body.includes(`@${p.name}`)).map((p) => p.id)
    send.mutate(
      { groupId, body, files, mentions, onProgress: (done, total) => setProgress([done, total]) },
      {
        onSuccess: () => {
          setBody('')
          setFiles([])
          setMentioned([])
        },
        onError: (err) => toast(errorMessage(err), 'error'),
        onSettled: () => setProgress(null),
      },
    )
  }

  const sendPoll = (poll: PollDraft) =>
    send.mutate(
      { groupId, body: '', files: [], poll },
      { onSuccess: () => setPollOpen(false), onError: (err) => toast(errorMessage(err), 'error') },
    )

  const uploading = progress && progress[1] > 0 && progress[0] < progress[1]

  return (
    <div
      className="fixed inset-x-0 z-20 px-safe"
      // En el chat no hay barra de navegación (AppShell): abajo del todo o encima del teclado
      style={{ bottom: keyboard ? keyboard + 8 : 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <form
        ref={box}
        onSubmit={onSubmit}
        className="mx-auto max-w-lg space-y-2 rounded-2xl border border-line bg-surface p-2 shadow-lg shadow-black/30"
      >
        {files.length > 0 && (
          <ul className="flex gap-2 overflow-x-auto">
            {previews.map((url, i) => (
              <li key={url} className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                <img src={url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  aria-label={`Quitar foto ${i + 1}`}
                  onClick={() => setFiles(files.filter((_, j) => j !== i))}
                  className="absolute top-0.5 right-0.5 grid size-6 place-items-center rounded-full bg-black/70 text-white"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {uploading && <p className="px-1 text-sm text-muted">Subiendo fotos {progress[0] + 1}/{progress[1]}…</p>}
        {suggestions.length > 0 && (
          <ul aria-label="Mencionar a" className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface-2">
            {suggestions.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  // mousedown: que el teclado del móvil no se cierre al elegir
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(p)}
                  className="flex min-h-11 w-full items-center px-3 text-left font-semibold hover:bg-line"
                >
                  @{p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-1">
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <IconButton
            type="button"
            label="Añadir fotos"
            className="shrink-0 text-accent"
            disabled={files.length >= MAX_PHOTOS || send.isPending}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-5" />
          </IconButton>
          <IconButton
            type="button"
            label="Crear encuesta"
            className="-ml-1 shrink-0 text-accent"
            disabled={send.isPending}
            onClick={() => setPollOpen(true)}
          >
            <BarChart3 className="size-5" />
          </IconButton>
          <TextArea
            label="Escribe un mensaje"
            className="flex-1 [&_label]:sr-only [&_textarea]:max-h-40 [&_textarea]:resize-none [&_textarea]:field-sizing-content"
            rows={1}
            maxLength={2000}
            placeholder="Escribe un mensaje… (@ para mencionar)"
            value={body}
            onChange={(e) => onType(e.target)}
            onSelect={(e) => onType(e.currentTarget)}
          />
          <Button
            type="submit"
            aria-label="Enviar mensaje"
            loading={send.isPending}
            disabled={!body.trim() && !files.length}
            className="size-11 shrink-0 px-0!"
          >
            {!send.isPending && <SendHorizontal className="size-5" />}
          </Button>
        </div>
      </form>
      {pollOpen && <PollDialog sending={send.isPending} onSend={sendPoll} onClose={() => setPollOpen(false)} />}
    </div>
  )
}

/** Crear una encuesta en el chat: hoja que sube desde abajo */
function PollDialog({ sending, onSend, onClose }: { sending: boolean; onSend: (poll: PollDraft) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [poll, setPoll] = useState<PollDraft>(emptyPoll)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => dialog.current?.showModal(), [])

  return (
    <dialog
      ref={dialog}
      aria-label="Crear encuesta"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && dialog.current?.close()}
      className="mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-surface text-fg shadow-2xl backdrop:bg-black/60"
    >
      <form
        className="space-y-4 px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault()
          const err = pollDraftError(poll)
          setError(err)
          if (!err) onSend(poll)
        }}
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="size-6 text-accent" aria-hidden />
          <h2 className="flex-1 text-xl font-bold">Nueva encuesta</h2>
          <button type="button" onClick={() => dialog.current?.close()} aria-label="Cerrar" className="grid size-11 place-items-center rounded-full text-muted hover:bg-surface-2">
            <X className="size-5" />
          </button>
        </div>
        <PollEditor value={poll} onChange={setPoll} />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <Button type="submit" block loading={sending}>
          Enviar encuesta
        </Button>
      </form>
    </dialog>
  )
}
