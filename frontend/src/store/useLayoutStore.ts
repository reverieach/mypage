import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { defaultLayouts, type GridLayouts } from '../layout/defaultLayouts'
import {
  appendWidgetToLayouts,
  compactLayouts,
  normalizeLayouts,
} from '../layout/layoutEngine'

type LayoutState = {
  layouts: GridLayouts
  updatedAt: string | null
  appendWidgetLayout: (widgetId: string, visibleWidgetIds: string[]) => void
  compactLayouts: (visibleWidgetIds: string[]) => void
  importLayouts: (
    layouts: GridLayouts,
    updatedAt?: string | null,
    visibleWidgetIds?: string[],
  ) => void
  setLayouts: (layouts: GridLayouts, visibleWidgetIds?: string[]) => void
  resetLayouts: (visibleWidgetIds?: string[]) => void
}

function nowStamp() {
  return new Date().toISOString()
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: defaultLayouts,
      updatedAt: null,
      appendWidgetLayout: (widgetId, visibleWidgetIds) =>
        set((state) => ({
          layouts: appendWidgetToLayouts(
            state.layouts,
            widgetId,
            visibleWidgetIds,
          ),
          updatedAt: nowStamp(),
        })),
      compactLayouts: (visibleWidgetIds) =>
        set((state) => ({
          layouts: compactLayouts(state.layouts, visibleWidgetIds),
          updatedAt: nowStamp(),
        })),
      importLayouts: (layouts, updatedAt, visibleWidgetIds) =>
        set({
          layouts: visibleWidgetIds
            ? compactLayouts(layouts, visibleWidgetIds)
            : normalizeLayouts(layouts),
          updatedAt: updatedAt ?? null,
        }),
      setLayouts: (layouts, visibleWidgetIds) =>
        set({
          layouts: normalizeLayouts(layouts, visibleWidgetIds),
          updatedAt: nowStamp(),
        }),
      resetLayouts: (visibleWidgetIds) =>
        set({
          layouts: visibleWidgetIds
            ? compactLayouts(defaultLayouts, visibleWidgetIds)
            : normalizeLayouts(defaultLayouts),
          updatedAt: nowStamp(),
        }),
    }),
    {
      name: 'mypage-widget-layouts',
    },
  ),
)
