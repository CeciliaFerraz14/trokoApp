import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { format, isSameDay } from 'date-fns'
import { ImagePlus, Lock, MessagesSquare, SendHorizontal, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatPastDay } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { MAX_PHOTOS } from '@/lib/photos'
import { Avatar } from '@/components/ui/Avatar'
import { Button, IconButton } from '@/components/ui/Button'
import { TextArea } from '@/components/ui/Field'
import { Linkify } from '@/components/ui/Linkify'
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/States'
import { useToast } from '@/components/ui/Toast'
import { useMe } from '@/features/auth/useMe'
import { displayName } from '@/features/groups/api'
import { JoinRequestButton } from '@/features/groups/JoinRequestButton'
import { PhotoGrid } from '@/features/wall/PhotoGrid'
import { useChat, useChatRealtime, useDeleteMessage, useSendMessage, type ChatItem } from './api'

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
  const toast = useToast()
  const [selected, setSelected] = useState<string | null>(null)
  // Alto de la caja de escribir (fija abajo): se deja ese hueco al final de la lista
  const [composerHeight, setComposerHeight] = useState(0)
  useChatRealtime(groupId)

  // Las páginas llegan del más nuevo al más antiguo; se muestran al revés
  const messages = useMemo(() => (chat.data?.pages.flat() ?? []).slice().reverse(), [chat.data])

  // Al abrir y con cada mensaje nuevo, baja hasta el final (cargar anteriores no mueve nada)
  const newest = messages[messages.length - 1]?.id
  const scrolled = useRef(false)
  useEffect(() => {
    if (!newest || !composerHeight) return
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: scrolled.current ? 'smooth' : 'instant' })
    scrolled.current = true
  }, [newest, composerHeight])

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
                  />
                </li>
              )
            })}
          </ol>
        </>
      )}
      <Composer groupId={groupId} onHeight={setComposerHeight} />
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
}) {
  const time = format(new Date(m.created_at), 'H:mm')
  // Tocar el mensaje muestra "Borrar" (salvo al tocar un enlace o una foto)
  const onClick = (e: MouseEvent) => {
    if (canDelete && !(e.target as HTMLElement).closest('a, button')) onSelect()
  }

  return (
    <div className={cn('flex items-end gap-2', mine ? 'justify-end' : 'justify-start', first ? 'mt-3' : 'mt-1')}>
      {!mine &&
        (first ? <Avatar name={m.author?.full_name ?? '?'} url={m.author?.avatar_url} size="sm" /> : <span className="w-9 shrink-0" aria-hidden />)}
      <div className={cn('flex max-w-[80%] min-w-0 flex-col', mine ? 'items-end' : 'items-start')}>
        <div
          onClick={onClick}
          className={cn(
            'min-w-0 space-y-2 rounded-2xl px-3 py-2',
            mine ? 'rounded-br-md bg-brand-blue text-brand-black [&_a]:text-brand-black' : 'rounded-bl-md border border-line bg-surface',
            m.photos.length > 0 && 'w-64 max-w-full',
          )}
        >
          {!mine && first && <p className="text-sm font-semibold text-accent">{m.author ? displayName(m.author) : 'Cuenta eliminada'}</p>}
          <PhotoGrid photos={m.photos} bucket="chat" />
          {m.body && <Linkify text={m.body} />}
          <p className={cn('text-right text-xs', mine ? 'text-brand-black/70' : 'text-muted')}>
            {canDelete ? (
              <button type="button" onClick={onSelect} aria-expanded={selected} aria-label={`${time}: opciones del mensaje`}>
                {time}
              </button>
            ) : (
              time
            )}
          </p>
        </div>
        {selected && (
          <Button type="button" variant="secondary" className="mt-1 min-h-9 px-3 text-sm" icon={<Trash2 className="size-4" />} loading={deleting} onClick={onDelete}>
            Borrar
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Teclado en pantalla: cuánto tapa por abajo (0 si no está). En iPhone y en
 * Android el teclado encoge solo la zona visible, y lo fijo abajo se queda detrás.
 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop
      setInset(covered > 80 ? covered : 0)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])
  return inset
}

/** Caja para escribir, fija abajo: encima de la barra de navegación o del teclado */
function Composer({ groupId, onHeight }: { groupId: string; onHeight: (height: number) => void }) {
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
    send.mutate(
      { groupId, body, files, onProgress: (done, total) => setProgress([done, total]) },
      {
        onSuccess: () => {
          setBody('')
          setFiles([])
        },
        onError: (err) => toast(errorMessage(err), 'error'),
        onSettled: () => setProgress(null),
      },
    )
  }

  const uploading = progress && progress[1] > 0 && progress[0] < progress[1]

  return (
    <div
      className="fixed inset-x-0 z-20 px-safe"
      // Sin teclado: justo encima de la barra de navegación (4.75rem + safe area)
      style={{ bottom: keyboard ? keyboard + 8 : 'calc(5.25rem + env(safe-area-inset-bottom))' }}
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
          <TextArea
            label="Escribe un mensaje"
            className="flex-1 [&_label]:sr-only [&_textarea]:max-h-40 [&_textarea]:resize-none [&_textarea]:field-sizing-content"
            rows={1}
            maxLength={2000}
            placeholder="Escribe un mensaje…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
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
    </div>
  )
}
