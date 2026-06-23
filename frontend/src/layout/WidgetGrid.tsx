import {
  Responsive,
  WidthProvider,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout/legacy'
import { useMemo, useState } from 'react'

import type { WidgetConfig } from '../config/types'
import type { GridLayouts } from './defaultLayouts'
import { useLayoutStore } from '../store/useLayoutStore'
import { WidgetRenderer } from '../widgets/registry'
import { WidgetShell } from '../widgets/WidgetShell'
import { LinksFolderDialog } from '../widgets/links/LinksFolderDialog'

const ResponsiveGridLayout = WidthProvider(Responsive)

export function WidgetGrid({ widgets }: { widgets: WidgetConfig[] }) {
  const [isLinksOpen, setIsLinksOpen] = useState(false)
  const layouts = useLayoutStore((state) => state.layouts)
  const setLayouts = useLayoutStore((state) => state.setLayouts)
  const linksWidget = useMemo(
    () => widgets.find((widget) => widget.type === 'links.grid'),
    [widgets],
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
              onOpen={
                widget.type === 'links.grid'
                  ? () => setIsLinksOpen(true)
                  : undefined
              }
            >
              <WidgetRenderer config={widget} />
            </WidgetShell>
          </div>
        ))}
      </ResponsiveGridLayout>
      {linksWidget?.type === 'links.grid' ? (
        <LinksFolderDialog
          config={linksWidget}
          open={isLinksOpen}
          onOpenChange={setIsLinksOpen}
        />
      ) : null}
    </>
  )
}
