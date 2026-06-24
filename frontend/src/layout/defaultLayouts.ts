import type { ResponsiveLayouts } from 'react-grid-layout/legacy'

import { appConfig } from '../config/appConfig'
import type { WidgetLayout } from '../config/types'

export type GridLayoutItem = WidgetLayout & {
  i: string
}

export type GridLayouts = ResponsiveLayouts<string>

const desktopLayout = appConfig.widgets.map((widget) => ({
  i: widget.id,
  ...widget.layout,
}))

export const defaultLayouts: GridLayouts = {
  lg: desktopLayout,
  md: desktopLayout.map((item) => ({
    ...item,
    x: Math.min(item.x, 6),
    w: Math.min(item.w, 5),
  })),
  sm: desktopLayout.map((item, index) => ({
    ...item,
    x: 0,
    y: index * 3,
    w: 6,
  })),
}

export const breakpointColumns: Record<string, number> = {
  lg: 12,
  md: 10,
  sm: 6,
}

export const breakpointNames = Object.keys(defaultLayouts)
