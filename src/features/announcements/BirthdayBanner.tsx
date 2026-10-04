import type { CSSProperties } from 'react'
import { Cake } from 'lucide-react'
import { cn } from '@/lib/cn'
import { Avatar } from '@/components/ui/Avatar'
import type { AnnouncementAuthor } from './api'

type Shape = 'rect' | 'dot' | 'curl'

/** Piezas de confeti alrededor del avatar: posición (% del recuadro), giro, forma y color */
const PIECES: { x: number; y: number; r: number; shape: Shape; color: string }[] = [
  { x: 14, y: 18, r: -25, shape: 'rect', color: 'var(--color-brand-blue)' },
  { x: 27, y: 8, r: 40, shape: 'dot', color: 'currentColor' },
  { x: 38, y: 4, r: 10, shape: 'curl', color: 'var(--color-brand-blue-light)' },
  { x: 62, y: 5, r: -30, shape: 'rect', color: 'var(--color-brand-blue-dark)' },
  { x: 74, y: 12, r: 15, shape: 'curl', color: 'var(--color-brand-blue)' },
  { x: 86, y: 22, r: 60, shape: 'dot', color: 'var(--color-brand-blue-light)' },
  { x: 9, y: 46, r: 80, shape: 'curl', color: 'currentColor' },
  { x: 22, y: 38, r: 20, shape: 'dot', color: 'var(--color-brand-blue-dark)' },
  { x: 78, y: 40, r: -50, shape: 'rect', color: 'currentColor' },
  { x: 91, y: 52, r: 30, shape: 'rect', color: 'var(--color-brand-blue)' },
  { x: 16, y: 74, r: 35, shape: 'rect', color: 'var(--color-brand-blue-light)' },
  { x: 26, y: 88, r: -15, shape: 'curl', color: 'var(--color-brand-blue)' },
  { x: 36, y: 94, r: 0, shape: 'dot', color: 'var(--color-brand-blue)' },
  { x: 64, y: 93, r: 25, shape: 'rect', color: 'currentColor' },
  { x: 76, y: 84, r: -40, shape: 'dot', color: 'var(--color-brand-blue-dark)' },
  { x: 87, y: 72, r: 10, shape: 'curl', color: 'var(--color-brand-blue-light)' },
]

function Piece({ shape, color }: { shape: Shape; color: string }) {
  if (shape === 'dot') return <span className="block size-2 rounded-full" style={{ backgroundColor: color }} />
  if (shape === 'rect') return <span className="block h-3 w-1.5 rounded-[2px]" style={{ backgroundColor: color }} />
  return (
    <svg viewBox="0 0 16 10" className="block h-2.5 w-4" fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round">
      <path d="M1 7c2-5 4-5 5 0s3 5 4 0 3-5 5 0" />
    </svg>
  )
}

/** Cabecera de los avisos de cumpleaños: la foto de la persona con una tarta y confeti alrededor */
export function BirthdayBanner({ person, large = false }: { person: AnnouncementAuthor | null | undefined; large?: boolean }) {
  return (
    <div className={cn('relative mx-auto text-fg', large ? 'h-48 max-w-72' : 'h-36 max-w-60')} aria-hidden>
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="absolute -translate-1/2 motion-safe:animate-[confetti-float_3.2s_ease-in-out_infinite]"
          style={{ left: `${p.x}%`, top: `${p.y}%`, '--r': `${p.r}deg`, transform: `rotate(${p.r}deg)`, animationDelay: `${(i % 5) * -0.6}s` } as CSSProperties}
        >
          <Piece shape={p.shape} color={p.color} />
        </span>
      ))}
      <div className="absolute top-1/2 left-1/2 -translate-1/2">
        <Avatar
          name={person?.full_name ?? '?'}
          url={person?.avatar_url}
          size={large ? 'xl' : 'lg'}
          className="ring-4 ring-brand-blue"
        />
        <span
          className={cn(
            'absolute -right-2 -bottom-1 grid place-items-center rounded-full bg-brand-blue text-brand-black ring-4 ring-surface',
            large ? 'size-11' : 'size-9',
          )}
        >
          <Cake className={large ? 'size-6' : 'size-5'} />
        </span>
      </div>
    </div>
  )
}
