import { Fragment } from 'react'

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'»])/g

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Resalta en negrita las palabras indicadas (p. ej. las menciones "@Rosa") */
function Highlight({ text, words }: { text: string; words?: string[] }) {
  if (!words?.length) return <>{text}</>
  const re = new RegExp(`(${words.map(escape).join('|')})`, 'g')
  return <>{text.split(re).map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-extrabold">{part}</strong> : <Fragment key={i}>{part}</Fragment>))}</>
}

/** Texto plano con saltos de línea y enlaces pulsables */
export function Linkify({ text, className, highlight }: { text: string; className?: string; highlight?: string[] }) {
  const parts = text.split(URL_RE)
  return (
    <p className={`break-words whitespace-pre-wrap ${className ?? ''}`}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
            {part.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        ) : (
          <Highlight key={i} text={part} words={highlight} />
        ),
      )}
    </p>
  )
}
