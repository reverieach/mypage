import { useMemo } from 'react'

import { createEffectiveConfig, useConfigStore } from '../store/useConfigStore'

export function useEffectiveConfig() {
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const links = useConfigStore((state) => state.links)
  const hiddenWidgetIds = useConfigStore((state) => state.hiddenWidgetIds)

  return useMemo(
    () =>
      createEffectiveConfig({
        wallpaper,
        wallpapers,
        links,
        hiddenWidgetIds,
      }),
    [hiddenWidgetIds, links, wallpaper, wallpapers],
  )
}
