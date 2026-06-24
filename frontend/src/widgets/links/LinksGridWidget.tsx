import { Plus } from 'lucide-react'
import { LayoutGroup, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { LinksGridWidgetConfig, QuickLink } from '../../config/types'
import { AddLinkDialog } from './AddLinkDialog'
import { DraggableLinkTile } from './DraggableLinkTile'

const TILE_GAP = 12
const MIN_TILE_WIDTH = 82
const MIN_ROW_HEIGHT = 84
type LinkGridItem =
  | { type: 'link'; link: QuickLink; originalIndex: number }
  | { type: 'add'; id: string }

function chunkItems<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

export function LinksGridWidget({ config }: { config: LinksGridWidgetConfig }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [frame, setFrame] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const element = containerRef.current

    if (!element) {
      return
    }

    const measure = () => {
      setFrame({
        width: Math.round(element.clientWidth),
        height: Math.round(element.clientHeight),
      })
    }
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setFrame({
        width: Math.round(width),
        height: Math.round(height),
      })
    })
    const frameId = window.requestAnimationFrame(measure)

    measure()
    observer.observe(element)
    window.addEventListener('resize', measure)

    return () => {
      window.cancelAnimationFrame(frameId)
      window.removeEventListener('resize', measure)
      observer.disconnect()
    }
  }, [])

  const columns = Math.max(
    1,
    Math.floor((frame.width + TILE_GAP) / (MIN_TILE_WIDTH + TILE_GAP)),
  )
  const visibleRows = Math.max(
    1,
    Math.floor((frame.height + TILE_GAP) / (MIN_ROW_HEIGHT + TILE_GAP)),
  )
  const rowHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.floor((frame.height - TILE_GAP * (visibleRows - 1)) / visibleRows),
  )
  const items = useMemo<LinkGridItem[]>(
    () => [
      ...config.links.map((link, originalIndex) => ({
        type: 'link' as const,
        link,
        originalIndex,
      })),
      { type: 'add', id: '__add-link__' },
    ],
    [config.links],
  )
  const rows = chunkItems(items, columns)

  return (
    <div
      ref={containerRef}
      className="scrollbar-none h-full overflow-y-auto overscroll-contain"
      style={{ scrollSnapType: 'y mandatory' }}
    >
      <LayoutGroup>
        <div className="grid" style={{ gap: TILE_GAP }}>
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="grid"
            style={{
              gap: TILE_GAP,
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              height: rowHeight,
              scrollSnapAlign: 'start',
            }}
          >
            {row.map((item) =>
              item.type === 'add' ? (
                <AddLinkDialog
                  key={item.id}
                  trigger={
                    <motion.button
                      layout
                      type="button"
                      className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/18 bg-white/8 px-2 py-2 text-center text-white/68 transition hover:-translate-y-0.5 hover:bg-white/16 hover:text-white"
                      transition={{
                        duration: 0.18,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12">
                        <Plus className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <span className="w-full truncate text-xs font-medium">
                        Add
                      </span>
                    </motion.button>
                  }
                />
              ) : (
                <DraggableLinkTile
                  key={item.link.id}
                  index={item.originalIndex}
                  link={item.link}
                  fit
                />
              ),
            )}
          </div>
        ))}
        </div>
      </LayoutGroup>
    </div>
  )
}
