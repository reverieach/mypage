import {
  Responsive,
  useContainerWidth,
  type Layout,
  type ResponsiveLayouts,
} from 'react-grid-layout'

import { appConfig } from '../config/appConfig'
import type { GridLayouts } from './defaultLayouts'
import { useLayoutStore } from '../store/useLayoutStore'
import { WidgetRenderer } from '../widgets/registry'
import { WidgetShell } from '../widgets/WidgetShell'

export function WidgetGrid() {
  const layouts = useLayoutStore((state) => state.layouts)
  const setLayouts = useLayoutStore((state) => state.setLayouts)
  const { containerRef, mounted, width } = useContainerWidth({
    initialWidth: 1200,
  })

  return (
    <div ref={containerRef}>
      {mounted && (
        <Responsive
          className="layout"
          width={width}
          layouts={layouts as ResponsiveLayouts}
          breakpoints={{ lg: 1200, md: 900, sm: 640 }}
          cols={{ lg: 12, md: 10, sm: 6 }}
          rowHeight={72}
          margin={[18, 18]}
          containerPadding={[0, 0]}
          dragConfig={{ handle: '.widget-drag-handle' }}
          onLayoutChange={(_layout: Layout, allLayouts: ResponsiveLayouts) =>
            setLayouts(allLayouts as GridLayouts)
          }
          resizeConfig={{ handles: ['se'] }}
        >
          {appConfig.widgets.map((widget) => (
            <div key={widget.id}>
              <WidgetShell title={widget.title}>
                <WidgetRenderer config={widget} />
              </WidgetShell>
            </div>
          ))}
        </Responsive>
      )}
    </div>
  )
}
