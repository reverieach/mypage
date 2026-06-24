import { useMemo } from 'react'

import { createEffectiveConfig, useConfigStore } from '../store/useConfigStore'

export function useEffectiveConfig() {
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const links = useConfigStore((state) => state.links)
  const hiddenWidgetIds = useConfigStore((state) => state.hiddenWidgetIds)
  const note = useConfigStore((state) => state.note)
  const searchEngineId = useConfigStore((state) => state.searchEngineId)
  const updatedAt = useConfigStore((state) => state.updatedAt)

  return useMemo(
    () =>
      createEffectiveConfig({
        wallpaper,
        wallpapers,
        links,
        hiddenWidgetIds,
        note,
        searchEngineId,
        updatedAt,
      }),
    [hiddenWidgetIds, links, note, searchEngineId, updatedAt, wallpaper, wallpapers],
  )
}
