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

const breakpointColumns: Record<string, number> = {
  lg: 12,
  md: 10,
  sm: 6,
}

function clampLayoutToBreakpoint(
  layout: GridLayoutItem,
  breakpoint: string,
): GridLayoutItem {
  const columns = breakpointColumns[breakpoint] ?? 12
  const minW = layout.minW ?? 1
  const width = Math.min(Math.max(layout.w, minW), columns)

  return {
    ...layout,
    x: Math.min(Math.max(layout.x, 0), Math.max(0, columns - width)),
    w: width,
  }
}

export function appendWidgetToLayouts(
  layouts: GridLayouts,
  widgetId: string,
  visibleWidgetIds: string[],
): GridLayouts {
  const normalized = normalizeLayouts(layouts)
  const nextLayouts: GridLayouts = {}

  for (const breakpoint of Object.keys(defaultLayouts)) {
    const defaults = defaultLayouts[breakpoint] ?? []
    const current = normalized[breakpoint] ?? []
    const defaultItem = defaults.find((item) => item.i === widgetId)

    if (!defaultItem) {
      nextLayouts[breakpoint] = current
      continue
    }

    const visibleItems = current.filter((item) =>
      visibleWidgetIds.includes(item.i),
    )
    const bottom = visibleItems.reduce(
      (maxY, item) => Math.max(maxY, item.y + item.h),
      0,
    )
    const appendedItem = clampLayoutToBreakpoint(
      {
        ...defaultItem,
        x: 0,
        y: bottom,
      },
      breakpoint,
    )

    nextLayouts[breakpoint] = current.map((item) =>
      item.i === widgetId ? appendedItem : item,
    )
  }

  return normalizeLayouts(nextLayouts)
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
