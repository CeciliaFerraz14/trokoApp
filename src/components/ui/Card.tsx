import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-[1.4rem] border border-(--card-border) bg-surface p-4', className)} {...rest} />
}

export function SectionTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn('mb-2 px-1 font-display text-sm font-semibold tracking-wider text-muted uppercase', className)} {...rest} />
}
