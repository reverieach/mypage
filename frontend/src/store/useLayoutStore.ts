import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  defaultLayouts,
  normalizeLayouts,
  type GridLayouts,
} from '../layout/defaultLayouts'

type LayoutState = {
  layouts: GridLayouts
  setLayouts: (layouts: GridLayouts) => void
  resetLayouts: () => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      layouts: defaultLayouts,
      setLayouts: (layouts) => set({ layouts: normalizeLayouts(layouts) }),
      resetLayouts: () => set({ layouts: defaultLayouts }),
    }),
    {
      name: 'mypage-widget-layouts',
    },
  ),
)
