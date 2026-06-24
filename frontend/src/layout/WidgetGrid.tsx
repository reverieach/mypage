import {
  Responsive,
  WidthProvider,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout/legacy'
import { useEffect, useMemo, useRef, useState } from 'react'

import type { WidgetConfig } from '../config/types'
import type { GridLayouts } from './defaultLayouts'
import { normalizeLayouts } from './layoutEngine'
import { useConfigStore } from '../store/useConfigStore'
import { useLayoutStore } from '../store/useLayoutStore'
import { WidgetDetailDialog } from '../widgets/WidgetDetailDialog'
import { WidgetRenderer } from '../widgets/registry'
import { WidgetShell } from '../widgets/WidgetShell'
import { LinksFolderDialog } from '../widgets/links/LinksFolderDialog'

const ResponsiveGridLayout = WidthProvider(Responsive)

export function WidgetGrid({ widgets }: { widgets: WidgetConfig[] }) {
  const [openWidgetId, setOpenWidgetId] = useState<string | null>(null)
  const [hidingWidgetIds, setHidingWidgetIds] = useState<string[]>([])
  const compactedVisibleKeyRef = useRef<string | null>(null)
  const hideTimersRef = useRef<Record<string, number>>({})
  const hideWidget = useConfigStore((state) => state.hideWidget)
  const layouts = useLayoutStore((state) => state.layouts)
  const compactWidgetLayouts = useLayoutStore((state) => state.compactLayouts)
  const setLayouts = useLayoutStore((state) => state.setLayouts)
  const visibleWidgetIds = useMemo(
    () => widgets.map((widget) => widget.id),
    [widgets],
  )
  const normalizedLayouts = useMemo(
    () => normalizeLayouts(layouts, visibleWidgetIds),
    [layouts, visibleWidgetIds],
  )
  const linksWidget = useMemo(
    () => widgets.find((widget) => widget.type === 'links.grid'),
    [widgets],
  )
  const openWidget = useMemo(
    () => widgets.find((widget) => widget.id === openWidgetId) ?? null,
    [openWidgetId, widgets],
  )

  useEffect(() => {
    const timers = hideTimersRef.current

    return () => {
      Object.values(timers).forEach((timer) =>
        window.clearTimeout(timer),
      )
    }
  }, [])

  useEffect(() => {
    const visibleKey = visibleWidgetIds.join('|')

    if (compactedVisibleKeyRef.current === visibleKey) {
      return
    }

    compactedVisibleKeyRef.current = visibleKey
    compactWidgetLayouts(visibleWidgetIds)
  }, [compactWidgetLayouts, visibleWidgetIds])

  function handleHideWidget(id: string) {
    if (hidingWidgetIds.includes(id) || hideTimersRef.current[id]) {
      return
    }

    setHidingWidgetIds((ids) => [...ids, id])
    hideTimersRef.current[id] = window.setTimeout(() => {
      hideWidget(id)
      compactWidgetLayouts(
        visibleWidgetIds.filter((widgetId) => widgetId !== id),
      )
      setHidingWidgetIds((ids) => ids.filter((widgetId) => widgetId !== id))
      delete hideTimersRef.current[id]
    }, 220)
  }

  return (
    <>
      <ResponsiveGridLayout
        className="layout"
        layouts={normalizedLayouts as ResponsiveLayouts}
        breakpoints={{ lg: 1200, md: 900, sm: 640 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={72}
        margin={[18, 18]}
        containerPadding={[0, 0]}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={(_layout: Layout, allLayouts: ResponsiveLayouts) =>
          setLayouts(allLayouts as GridLayouts, visibleWidgetIds)
        }
        resizeHandles={['se']}
      >
        {widgets.map((widget) => {
          const isHiding = hidingWidgetIds.includes(widget.id)

          return (
          <div key={widget.id}>
            <WidgetShell
              className={
                isHiding
                  ? 'scale-95 opacity-0 transition duration-200 ease-out'
                  : 'scale-100 opacity-100 transition duration-200 ease-out'
              }
              title={widget.title}
              onHide={() => handleHideWidget(widget.id)}
              onOpen={() => setOpenWidgetId(widget.id)}
            >
              <WidgetRenderer config={widget} />
            </WidgetShell>
          </div>
          )
        })}
      </ResponsiveGridLayout>
      {linksWidget?.type === 'links.grid' ? (
        <LinksFolderDialog
          config={linksWidget}
          open={openWidget?.type === 'links.grid'}
          onOpenChange={(open) => setOpenWidgetId(open ? linksWidget.id : null)}
        />
      ) : null}
      <WidgetDetailDialog
        config={openWidget?.type === 'links.grid' ? null : openWidget}
        open={Boolean(openWidget && openWidget.type !== 'links.grid')}
        onOpenChange={(open) => {
          if (!open) {
            setOpenWidgetId(null)
          }
        }}
      />
    </>
  )
}
