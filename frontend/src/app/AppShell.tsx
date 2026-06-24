import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

import { useEffectiveConfig } from '../config/useEffectiveConfig'
import { deriveWallpaperPreview } from '../data/wallpapers'
import { SearchBar } from '../features/search/SearchBar'
import { SettingsButton } from '../features/settings/SettingsButton'
import { ClockDisplay } from '../features/time/ClockDisplay'
import { WallpaperLayer } from '../layout/WallpaperLayer'
import { useConfigStore } from '../store/useConfigStore'
import { WidgetGrid } from '../layout/WidgetGrid'
import { getTheme } from '../themes/registry'

export function AppShell() {
  const config = useEffectiveConfig()
  const [contentHidden, setContentHidden] = useState(false)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const selectedWallpaper = wallpapers.find(
    (item) => item.src === config.wallpaper,
  )
  const theme = getTheme(config.theme)
  const wallpaperPreview =
    selectedWallpaper?.preview ??
    (selectedWallpaper?.kind === 'video'
      ? deriveWallpaperPreview(config.wallpaper)
      : undefined)

  return (
    <main className={theme.className}>
      <WallpaperLayer
        src={config.wallpaper}
        kind={selectedWallpaper?.kind}
        preview={wallpaperPreview}
      />
      <SettingsButton
        contentHidden={contentHidden}
        onToggleContentHidden={() => setContentHidden((hidden) => !hidden)}
      />
      <AnimatePresence initial={false}>
        {!contentHidden ? (
          <motion.div
            key="page-content"
            className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-20"
            initial={{ opacity: 0, y: 10, scale: 0.995 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.985 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <section className="mb-10 pt-4">
              <ClockDisplay />
              <SearchBar engines={config.searchEngines} />
            </section>
            <WidgetGrid widgets={config.widgets} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  )
}
