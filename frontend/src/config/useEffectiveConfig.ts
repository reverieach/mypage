import { useMemo } from 'react'

import { createEffectiveConfig, useConfigStore } from '../store/useConfigStore'

export function useEffectiveConfig() {
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const links = useConfigStore((state) => state.links)

  return useMemo(
    () =>
      createEffectiveConfig({
        wallpaper,
        links,
      }),
    [links, wallpaper],
  )
}
