import { GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'

import type { QuickLink } from '../../config/types'
import { useConfigStore } from '../../store/useConfigStore'
import { cn } from '../../utils/cn'
import { LinkFavicon } from './LinkFavicon'

type DraggableLinkTileProps = {
  link: QuickLink
  index: number
  size?: 'compact' | 'large'
}

export function DraggableLinkTile({
  link,
  index,
  size = 'compact',
}: DraggableLinkTileProps) {
  const moveLinkToIndex = useConfigStore((state) => state.moveLinkToIndex)

  function handleDragStart(event: DragEvent<HTMLAnchorElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', link.id)
  }

  function handleDrop(event: DragEvent<HTMLAnchorElement>) {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain')

    if (draggedId && draggedId !== link.id) {
      moveLinkToIndex(draggedId, index)
    }
  }

  return (
    <a
      draggable
      href={link.href}
      className={cn(
        'group relative flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/12 px-2 text-center transition hover:-translate-y-0.5 hover:bg-white/22',
        size === 'large' ? 'min-h-28 py-4' : 'min-h-24 py-3',
      )}
      onDragStart={handleDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <GripVertical className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/0 transition group-hover:text-white/42" />
      <LinkFavicon href={link.href} label={link.label} />
      <span className="w-full truncate text-xs font-medium text-white/82">
        {link.label}
      </span>
    </a>
  )
}
