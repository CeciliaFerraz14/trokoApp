import { Link } from 'react-router'
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { usePush } from '@/lib/push'
import { Button } from './Button'
import { useToast } from './Toast'

const STATUS = {
  on: 'Activadas',
  off: 'Desactivadas',
  denied: 'Bloqueadas',
  'ios-install': 'Instala la app',
  unsupported: 'No disponibles',
} as const

/** Fila de Ajustes (Perfil): activa o desactiva los avisos en este dispositivo */
export function PushSettingRow() {
  const { state, busy, enable, disable } = usePush()
  const toast = useToast()
  if (!state) return null

  const onClick = async () => {
    try {
      if (state === 'on') {
        await disable()
        toast('Notificaciones desactivadas en este móvil')
      } else if (state === 'off') {
        await enable()
        toast('¡Notificaciones activadas!')
      } else if (state === 'denied') {
        toast('Están bloqueadas: actívalas en los ajustes del móvil para esta app', 'error')
      } else if (state === 'unsupported') {
        toast('Este navegador no permite notificaciones', 'error')
      }
    } catch (e) {
      toast(errorMessage(e), 'error')
    }
  }

  const Icon = state === 'on' ? BellRing : state === 'off' ? Bell : BellOff
  const row = (
    <>
      {busy ? <Loader2 className="size-5 animate-spin text-accent" /> : <Icon className="size-5 text-accent" />}
      <span className="flex-1">
        <span className="block font-semibold">Notificaciones</span>
        <span className="block text-sm text-muted">Publicaciones en tus grupos y cuando te aceptan</span>
      </span>
      <span className="text-muted">{STATUS[state]}</span>
    </>
  )
  // En iPhone hay que instalar la app primero: lleva a las instrucciones
  return state === 'ios-install' ? (
    <Link to="/instalar" className="flex min-h-16 items-center gap-3 px-4 py-2 hover:bg-surface-2">
      {row}
    </Link>
  ) : (
    <button type="button" onClick={onClick} disabled={busy} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
      {row}
    </button>
  )
}

/** Botón para activar los avisos (pantalla de espera, invitación en Muro). No pinta nada si ya están o no se puede */
export function PushEnableButton({ label, onDone }: { label: string; onDone?: () => void }) {
  const { state, busy, enable } = usePush()
  const toast = useToast()
  if (state === 'on') return <p className="flex items-center justify-center gap-2 text-sm font-semibold text-accent"><BellRing className="size-4" /> Te avisaremos en este móvil</p>
  if (state === 'ios-install') {
    return (
      <p className="text-center text-sm text-muted">
        Para recibir avisos en iPhone, <Link to="/instalar" className="font-semibold text-accent underline">instala la app</Link> en la pantalla de inicio.
      </p>
    )
  }
  if (state !== 'off') return null
  return (
    <Button
      variant="secondary"
      icon={<Bell className="size-4" />}
      loading={busy}
      onClick={() =>
        enable().then(
          () => {
            toast('¡Notificaciones activadas!')
            onDone?.()
          },
          (e) => toast(errorMessage(e), 'error'),
        )
      }
    >
      {label}
    </Button>
  )
}
