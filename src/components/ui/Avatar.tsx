import { cn } from '@/lib/cn'

interface Props {
  name?: string | null
  url?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizes = { sm: 'size-9 text-sm', md: 'size-11 text-base', lg: 'size-16 text-xl', xl: 'size-24 text-3xl' }

function initials(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function Avatar({ name, url, size = 'md', className }: Props) {
  return (
    <span
      className={cn(
        'inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-brand-blue/20 font-display font-semibold text-accent',
        sizes[size],
        className,
      )}
    >
      {url ? <img src={url} alt="" loading="lazy" className="size-full object-cover" /> : initials(name)}
    </span>
  )
}
