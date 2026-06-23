import { useMemo } from 'react'

import { createEffectiveConfig, useConfigStore } from '../store/useConfigStore'

export function useEffectiveConfig() {
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const links = useConfigStore((state) => state.links)

  return useMemo(
    () =>
      createEffectiveConfig({
        wallpaper,
        wallpapers,
        links,
      }),
    [links, wallpaper, wallpapers],
  )
}
