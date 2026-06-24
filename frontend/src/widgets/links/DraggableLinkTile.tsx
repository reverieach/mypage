import { GripVertical } from 'lucide-react'
import type { DragEvent } from 'react'
import { useEffect } from 'react'

import type { QuickLink } from '../../config/types'
import { cacheLinkIcon } from '../../data/linkIcons'
import { useConfigStore } from '../../store/useConfigStore'
import { cn } from '../../utils/cn'
import { LinkFavicon } from './LinkFavicon'

type DraggableLinkTileProps = {
  link: QuickLink
  index: number
  size?: 'compact' | 'large'
  fit?: boolean
}

export function DraggableLinkTile({
  link,
  index,
  size = 'compact',
  fit = false,
}: DraggableLinkTileProps) {
  const moveLinkToIndex = useConfigStore((state) => state.moveLinkToIndex)
  const updateLink = useConfigStore((state) => state.updateLink)

  useEffect(() => {
    if (link.icon) {
      return
    }

    let cancelled = false

    void cacheLinkIcon(link.href, link.label)
      .then((envelope) => {
        if (!cancelled && envelope.data.icon) {
          updateLink(link.id, { icon: envelope.data.icon })
        }
      })
      .catch(() => {
        // The text fallback keeps links usable when the local Agent is offline.
      })

    return () => {
      cancelled = true
    }
  }, [link.href, link.icon, link.id, link.label, updateLink])

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
        fit ? 'h-full min-h-0 py-2' : null,
        !fit && size === 'large' ? 'min-h-28 py-4' : null,
        !fit && size === 'compact' ? 'min-h-24 py-3' : null,
      )}
      onDragStart={handleDragStart}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <GripVertical className="absolute right-1.5 top-1.5 h-3.5 w-3.5 text-white/0 transition group-hover:text-white/42" />
      <LinkFavicon icon={link.icon} label={link.label} />
      <span className="w-full truncate text-xs font-medium text-white/82">
        {link.label}
      </span>
    </a>
  )
}
