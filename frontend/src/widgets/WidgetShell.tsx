import { GripHorizontal } from 'lucide-react'
import type { PropsWithChildren } from 'react'

import { GlassCard } from '../components/ui/card'
import { cn } from '../utils/cn'

type WidgetShellProps = PropsWithChildren<{
  title: string
  className?: string
}>

export function WidgetShell({ title, className, children }: WidgetShellProps) {
  return (
    <GlassCard
      className={cn(
        'relative flex h-full min-h-0 flex-col overflow-hidden rounded-[28px] p-4 text-white',
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="truncate text-sm font-semibold tracking-wide text-white/86">
          {title}
        </h2>
        <div
          className="widget-drag-handle -mr-1 flex h-7 w-8 cursor-grab items-center justify-center rounded-full text-white/54 transition hover:bg-white/12 hover:text-white active:cursor-grabbing"
          aria-label={`Drag ${title}`}
          role="presentation"
        >
          <GripHorizontal className="h-4 w-4" aria-hidden="true" />
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </GlassCard>
  )
}
