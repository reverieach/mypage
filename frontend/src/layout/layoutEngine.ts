import {
  breakpointColumns,
  breakpointNames,
  defaultLayouts,
  type GridLayoutItem,
  type GridLayouts,
} from './defaultLayouts'

function visibleSet(visibleWidgetIds?: string[]) {
  return visibleWidgetIds ? new Set(visibleWidgetIds) : null
}

function isVisible(id: string, visibleIds: Set<string> | null) {
  return !visibleIds || visibleIds.has(id)
}

function clampLayoutToBreakpoint(
  layout: GridLayoutItem,
  breakpoint: string,
): GridLayoutItem {
  const columns = breakpointColumns[breakpoint] ?? 12
  const minW = layout.minW ?? 1
  const minH = layout.minH ?? 1
  const width = Math.min(Math.max(layout.w, minW), columns)

  return {
    ...layout,
    x: Math.min(Math.max(layout.x, 0), Math.max(0, columns - width)),
    y: Math.max(layout.y, 0),
    w: width,
    h: Math.max(layout.h, minH),
  }
}

function layoutsCollide(a: GridLayoutItem, b: GridLayoutItem) {
  return (
    a.x < b.x + b.w &&
    b.x < a.x + a.w &&
    a.y < b.y + b.h &&
    b.y < a.y + a.h
  )
}

function completeBreakpointLayout(
  layouts: GridLayouts,
  breakpoint: string,
): GridLayoutItem[] {
  const defaults = defaultLayouts[breakpoint] ?? []
  const current = layouts[breakpoint] ?? []

  return defaults.map((defaultItem) => {
    const item = current.find((layoutItem) => layoutItem.i === defaultItem.i)
    const minW = defaultItem.minW ?? 1
    const minH = defaultItem.minH ?? 1

    if (!item || item.w < minW || item.h < minH) {
      return clampLayoutToBreakpoint(defaultItem, breakpoint)
    }

    return clampLayoutToBreakpoint(
      {
        ...defaultItem,
        ...item,
        minW: defaultItem.minW,
        minH: defaultItem.minH,
        maxW: defaultItem.maxW,
        maxH: defaultItem.maxH,
      },
      breakpoint,
    )
  })
}

function repairVisibleCollisions(
  items: GridLayoutItem[],
  breakpoint: string,
  visibleWidgetIds?: string[],
): GridLayoutItem[] {
  const visibleIds = visibleSet(visibleWidgetIds)
  const repaired = [...items]
  const placed: Array<{ item: GridLayoutItem; index: number }> = []
  const ordered = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isVisible(item.i, visibleIds))
    .sort((a, b) => {
      if (a.item.y !== b.item.y) {
        return a.item.y - b.item.y
      }

      if (a.item.x !== b.item.x) {
        return a.item.x - b.item.x
      }

      return a.index - b.index
    })

  for (const entry of ordered) {
    let item = clampLayoutToBreakpoint(entry.item, breakpoint)
    let collision = placed.find((placedItem) =>
      layoutsCollide(item, placedItem.item),
    )

    while (collision) {
      item = {
        ...item,
        y: collision.item.y + collision.item.h,
      }
      collision = placed.find((placedItem) =>
        layoutsCollide(item, placedItem.item),
      )
    }

    repaired[entry.index] = item
    placed.push({ item, index: entry.index })
  }

  return repaired
}

function findFirstOpenPosition(
  item: GridLayoutItem,
  placed: GridLayoutItem[],
  columns: number,
): Pick<GridLayoutItem, 'x' | 'y'> {
  for (let y = 0; ; y += 1) {
    for (let x = 0; x <= columns - item.w; x += 1) {
      const candidate = { ...item, x, y }

      if (!placed.some((placedItem) => layoutsCollide(candidate, placedItem))) {
        return { x, y }
      }
    }
  }
}

function compactVisibleItems(
  items: GridLayoutItem[],
  breakpoint: string,
  visibleWidgetIds: string[],
): GridLayoutItem[] {
  const columns = breakpointColumns[breakpoint] ?? 12
  const visibleIds = new Set(visibleWidgetIds)
  const compacted = [...items]
  const placed: GridLayoutItem[] = []
  const ordered = items
    .map((item, index) => ({
      item: clampLayoutToBreakpoint(item, breakpoint),
      index,
    }))
    .filter(({ item }) => visibleIds.has(item.i))
    .sort((a, b) => {
      if (a.item.y !== b.item.y) {
        return a.item.y - b.item.y
      }

      if (a.item.x !== b.item.x) {
        return a.item.x - b.item.x
      }

      return a.index - b.index
    })

  for (const entry of ordered) {
    const nextPosition = findFirstOpenPosition(entry.item, placed, columns)
    const item = {
      ...entry.item,
      ...nextPosition,
    }

    compacted[entry.index] = item
    placed.push(item)
  }

  return compacted
}

export function normalizeLayouts(
  layouts: GridLayouts,
  visibleWidgetIds?: string[],
): GridLayouts {
  const normalized: GridLayouts = {}

  for (const breakpoint of breakpointNames) {
    normalized[breakpoint] = repairVisibleCollisions(
      completeBreakpointLayout(layouts, breakpoint),
      breakpoint,
      visibleWidgetIds,
    )
  }

  return normalized
}

export function compactLayouts(
  layouts: GridLayouts,
  visibleWidgetIds: string[],
): GridLayouts {
  const compacted: GridLayouts = {}

  for (const breakpoint of breakpointNames) {
    compacted[breakpoint] = compactVisibleItems(
      completeBreakpointLayout(layouts, breakpoint),
      breakpoint,
      visibleWidgetIds,
    )
  }

  return normalizeLayouts(compacted, visibleWidgetIds)
}

export function appendWidgetToLayouts(
  layouts: GridLayouts,
  widgetId: string,
  visibleWidgetIds: string[],
): GridLayouts {
  const normalized = normalizeLayouts(layouts, visibleWidgetIds)
  const nextLayouts: GridLayouts = {}
  const nextVisibleWidgetIds = visibleWidgetIds.includes(widgetId)
    ? visibleWidgetIds
    : [...visibleWidgetIds, widgetId]

  for (const breakpoint of breakpointNames) {
    const current = normalized[breakpoint] ?? []
    const defaultItem = defaultLayouts[breakpoint]?.find(
      (item) => item.i === widgetId,
    )

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

  return compactLayouts(nextLayouts, nextVisibleWidgetIds)
}
