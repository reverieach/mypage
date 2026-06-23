import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  appendWidgetToLayouts,
  defaultLayouts,
  normalizeLayouts,
  type GridLayouts,
} from '../layout/defaultLayouts'

type LayoutState = {
  layouts: GridLayouts
  appendWidgetLayout: (widgetId: string, visibleWidgetIds: string[]) => void
  setLayouts: (layouts: GridLayouts) => void
  resetLayouts: () => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: defaultLayouts,
      appendWidgetLayout: (widgetId, visibleWidgetIds) =>
        set((state) => ({
          layouts: appendWidgetToLayouts(
            state.layouts,
            widgetId,
            visibleWidgetIds,
          ),
        })),
      setLayouts: (layouts) => set({ layouts: normalizeLayouts(layouts) }),
      resetLayouts: () => set({ layouts: defaultLayouts }),
    }),
    {
      name: 'mypage-widget-layouts',
    },
  ),
)
