import { Fragment } from 'react'

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)"'»])/g

/** Texto plano con saltos de línea y enlaces pulsables */
export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_RE)
  return (
    <p className={`break-words whitespace-pre-wrap ${className ?? ''}`}>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
            {part.replace(/^https?:\/\/(www\.)?/, '')}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  )
}
