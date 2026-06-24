import { motion } from 'framer-motion'
import { X } from 'lucide-react'
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
  const [isDragging, setIsDragging] = useState(false)

  function handleDragStart(event: DragEvent<HTMLDivElement>) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', link.id)
    setIsDragging(true)
  }

  function handleDragEnter(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    const draggedId = event.dataTransfer.getData('text/plain')

    if (draggedId && draggedId !== link.id) {
      moveLinkToIndex(draggedId, index)
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
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
    <motion.div
      layout
      draggable
      className={cn(
        'group relative min-w-0 rounded-2xl border border-white/10 bg-white/12 text-center transition hover:-translate-y-0.5 hover:bg-white/22',
        fit ? 'h-full min-h-0 py-2' : null,
        !fit && size === 'large' ? 'min-h-28' : null,
        !fit && size === 'compact' ? 'min-h-24' : null,
        isDragging ? 'scale-95 opacity-70' : null,
      )}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onDragStartCapture={handleDragStart}
      onDragOverCapture={(event) => event.preventDefault()}
      onDragEnterCapture={handleDragEnter}
      onDropCapture={handleDrop}
      onDragEndCapture={() => setIsDragging(false)}
    >
      <a
        href={link.href}
        className={cn(
          'flex h-full min-w-0 flex-col items-center justify-center gap-2 px-2 text-center',
          fit ? 'min-h-0 py-2' : null,
          !fit && size === 'large' ? 'py-4' : null,
          !fit && size === 'compact' ? 'py-3' : null,
        )}
      >
        <LinkFavicon
          href={link.href}
          label={link.label}
          version={iconVersion}
          onIconError={refreshBrokenIcon}
        />
        <span className="w-full truncate text-xs font-medium text-white/82">
          {link.label}
        </span>
      </a>
      <button
        type="button"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/24 text-white/42 backdrop-blur-md transition hover:bg-rose-400/24 hover:text-white"
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
    </motion.div>
  )
}
