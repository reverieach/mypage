import {
  Responsive,
  WidthProvider,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout/legacy'
import { useMemo, useState } from 'react'

import type { WidgetConfig } from '../config/types'
import type { GridLayouts } from './defaultLayouts'
import { useConfigStore } from '../store/useConfigStore'
import { useLayoutStore } from '../store/useLayoutStore'
import { WidgetDetailDialog } from '../widgets/WidgetDetailDialog'
import { WidgetRenderer } from '../widgets/registry'
import { WidgetShell } from '../widgets/WidgetShell'
import { LinksFolderDialog } from '../widgets/links/LinksFolderDialog'

const ResponsiveGridLayout = WidthProvider(Responsive)

export function WidgetGrid({ widgets }: { widgets: WidgetConfig[] }) {
  const [openWidgetId, setOpenWidgetId] = useState<string | null>(null)
  const hideWidget = useConfigStore((state) => state.hideWidget)
  const layouts = useLayoutStore((state) => state.layouts)
  const setLayouts = useLayoutStore((state) => state.setLayouts)
  const linksWidget = useMemo(
    () => widgets.find((widget) => widget.type === 'links.grid'),
    [widgets],
  )
  const openWidget = useMemo(
    () => widgets.find((widget) => widget.id === openWidgetId) ?? null,
    [openWidgetId, widgets],
  )

  return (
    <>
      <ResponsiveGridLayout
        className="layout"
        layouts={layouts as ResponsiveLayouts}
        breakpoints={{ lg: 1200, md: 900, sm: 640 }}
        cols={{ lg: 12, md: 10, sm: 6 }}
        rowHeight={72}
        margin={[18, 18]}
        containerPadding={[0, 0]}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={(_layout: Layout, allLayouts: ResponsiveLayouts) =>
          setLayouts(allLayouts as GridLayouts)
        }
        resizeHandles={['se']}
      >
        {widgets.map((widget) => (
          <div key={widget.id}>
            <WidgetShell
              title={widget.title}
              onHide={() => hideWidget(widget.id)}
              onOpen={() => setOpenWidgetId(widget.id)}
            >
              <WidgetRenderer config={widget} />
            </WidgetShell>
          </div>
        ))}
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
