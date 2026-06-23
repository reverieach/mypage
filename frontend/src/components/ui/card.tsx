import type { HTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

export function GlassCard({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'relative border border-white/20 bg-white/16 shadow-glass backdrop-blur-2xl',
        'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-white/10',
        className,
      )}
      {...props}
    />
  )
}
