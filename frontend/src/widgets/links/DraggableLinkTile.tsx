import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { PointerEvent } from 'react'
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
  const pointerStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(
    null,
  )
  const suppressClickRef = useRef(false)
  const [iconVersion, setIconVersion] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return
    }

    if (
      event.target instanceof Element &&
      event.target.closest('button')
    ) {
      return
    }

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    suppressClickRef.current = false
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current

    if (!start) {
      return
    }

    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y)

    if (distance < 7) {
      return
    }

    suppressClickRef.current = true
    setIsDragging(true)

    const targetTile = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find(
        (element) =>
          element instanceof HTMLElement &&
          element.dataset.linkTileId &&
          element.dataset.linkTileId !== link.id,
      )

    if (!(targetTile instanceof HTMLElement)) {
      return
    }

    const targetIndex = Number(targetTile.dataset.linkIndex)

    if (Number.isFinite(targetIndex)) {
      moveLinkToIndex(link.id, targetIndex)
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStartRef.current

    if (start && event.currentTarget.hasPointerCapture(start.pointerId)) {
      event.currentTarget.releasePointerCapture(start.pointerId)
    }

    pointerStartRef.current = null
    setIsDragging(false)

    if (suppressClickRef.current) {
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 0)
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
    <motion.div
      layout
      data-link-index={index}
      data-link-tile-id={link.id}
      className={cn(
        'group relative min-w-0 rounded-2xl border border-white/10 bg-white/12 text-center transition hover:-translate-y-0.5 hover:bg-white/22',
        'cursor-grab active:cursor-grabbing',
        fit ? 'h-full min-h-0 py-2' : null,
        !fit && size === 'large' ? 'min-h-28' : null,
        !fit && size === 'compact' ? 'min-h-24' : null,
        isDragging ? 'scale-95 opacity-70' : null,
      )}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <a
        href={link.href}
        draggable={false}
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
    </motion.div>
  )
}
