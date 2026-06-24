import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { DragEvent } from 'react'
import { useRef, useState } from 'react'

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
  const removeLink = useConfigStore((state) => state.removeLink)
  const retriedIconRef = useRef<string | null>(null)
  const [iconVersion, setIconVersion] = useState(0)

  function handleDragStart(event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('application/x-mypage-link-id', link.id)
    event.dataTransfer.setData('text/plain', link.id)
  }

  function handleDragOver(event: DragEvent<HTMLAnchorElement>) {
    if (event.dataTransfer.types.includes('application/x-mypage-link-id')) {
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
    }
  }

  function handleDrop(event: DragEvent<HTMLAnchorElement>) {
    const draggedId = event.dataTransfer.getData('application/x-mypage-link-id')

    if (!draggedId) {
      return
    }

    event.preventDefault()

    if (draggedId !== link.id) {
      moveLinkToIndex(draggedId, index)
    }
  }

  function refreshBrokenIcon() {
    if (retriedIconRef.current === link.href) {
      return
    }

    retriedIconRef.current = link.href

    void cacheLinkIcon(link.href, link.label, true)
      .then((envelope) => {
        if (envelope.data.cached) {
          setIconVersion(Date.now())
        }
      })
      .catch(() => {
        // The letter fallback remains available if a site has no usable icon.
      })
  }

  return (
    <motion.a
      layout
      href={link.href}
      draggable={false}
      className={cn(
        'group relative flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/12 px-2 text-center transition hover:-translate-y-0.5 hover:bg-white/22',
        fit ? 'h-full min-h-0 py-2' : null,
        !fit && size === 'large' ? 'min-h-28 py-4' : null,
        !fit && size === 'compact' ? 'min-h-24 py-3' : null,
      )}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <button
        type="button"
        className="absolute left-1 top-1 rounded-full p-1 text-white/0 opacity-0 transition hover:bg-white/12 hover:text-white/78 hover:cursor-grab active:cursor-grabbing group-hover:text-white/34 group-hover:opacity-100 focus-visible:text-white/78 focus-visible:opacity-100"
        aria-label={`Drag ${link.label}`}
        title={`Drag ${link.label}`}
        draggable
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
        }}
        onDragStart={handleDragStart}
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      <LinkFavicon
        href={link.href}
        label={link.label}
        version={iconVersion}
        onIconError={refreshBrokenIcon}
      />
      <span className="w-full truncate text-xs font-medium text-white/82">
        {link.label}
      </span>
      <button
        type="button"
        className="absolute right-1 top-1 rounded-full p-1 text-white/0 opacity-0 transition hover:bg-white/12 hover:text-white/78 group-hover:text-white/34 group-hover:opacity-100 focus-visible:text-white/78 focus-visible:opacity-100"
        aria-label={`Remove ${link.label}`}
        title={`Remove ${link.label}`}
        draggable={false}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          removeLink(link.id)
        }}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </motion.a>
  )
}
