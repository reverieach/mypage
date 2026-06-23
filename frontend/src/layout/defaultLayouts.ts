import { appConfig } from '../config/appConfig'
import type { WidgetLayout } from '../config/types'

export type GridLayoutItem = WidgetLayout & {
  i: string
}

export type GridLayouts = Record<string, GridLayoutItem[]>

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
