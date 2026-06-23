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

export function normalizeLayouts(layouts: GridLayouts): GridLayouts {
  const normalized: GridLayouts = {}

  for (const breakpoint of Object.keys(defaultLayouts)) {
    const defaults = defaultLayouts[breakpoint] ?? []
    const current = layouts[breakpoint] ?? []

    normalized[breakpoint] = defaults.map((defaultItem) => {
      const item = current.find((layoutItem) => layoutItem.i === defaultItem.i)
      const minW = defaultItem.minW ?? 1
      const minH = defaultItem.minH ?? 1

      if (!item || item.w < minW || item.h < minH) {
        return defaultItem
      }

      return {
        ...defaultItem,
        ...item,
        minW: defaultItem.minW,
        minH: defaultItem.minH,
        maxW: defaultItem.maxW,
        maxH: defaultItem.maxH,
      }
    })
  }

  return normalized
}
