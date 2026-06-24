import { useEffect, useState } from 'react'
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
import type { SavedWallpaper } from '../store/useConfigStore'

const lastRandomWallpaperKey = 'mypage-last-random-wallpaper'

function isDaytime(date = new Date()) {
  const hour = date.getHours()

  return hour >= 6 && hour < 18
}

function eligibleWallpapers(wallpapers: SavedWallpaper[]) {
  const period = isDaytime() ? 'day' : 'night'

  return wallpapers.filter((wallpaper) => {
    const group = wallpaper.group ?? 'general'

    return group === 'general' || group === period
  })
}

function pickRandomWallpaper(wallpapers: SavedWallpaper[], fallback: string) {
  const candidates = eligibleWallpapers(wallpapers)

  if (!candidates.length) {
    return fallback
  }

  const lastWallpaper = localStorage.getItem(lastRandomWallpaperKey)
  const pool =
    candidates.length > 1
      ? candidates.filter((wallpaper) => wallpaper.src !== lastWallpaper)
      : candidates
  const selected = pool[Math.floor(Math.random() * pool.length)] ?? candidates[0]

  localStorage.setItem(lastRandomWallpaperKey, selected.src)
  return selected.src
}

export function AppShell() {
  const config = useEffectiveConfig()
  const [contentHidden, setContentHidden] = useState(false)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const randomWallpaperEnabled = useConfigStore(
    (state) => state.randomWallpaperEnabled,
  )
  const [randomWallpaperSrc, setRandomWallpaperSrc] = useState(() => {
    const state = useConfigStore.getState()

    return state.randomWallpaperEnabled
      ? pickRandomWallpaper(state.wallpapers, state.wallpaper)
      : null
  })
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!randomWallpaperEnabled) {
        setRandomWallpaperSrc(null)
        return
      }

      setRandomWallpaperSrc((current) => {
        const candidates = eligibleWallpapers(wallpapers)

        if (
          current &&
          candidates.some((wallpaper) => wallpaper.src === current)
        ) {
          return current
        }

        return pickRandomWallpaper(wallpapers, config.wallpaper)
      })
    }, 0)

    return () => window.clearTimeout(timer)
  }, [config.wallpaper, randomWallpaperEnabled, wallpapers])

  const activeWallpaperSrc =
    randomWallpaperEnabled && randomWallpaperSrc
      ? randomWallpaperSrc
      : config.wallpaper
  const selectedWallpaper = wallpapers.find(
    (item) => item.src === activeWallpaperSrc,
  )
  const theme = getTheme(config.theme)
  const wallpaperPreview =
    selectedWallpaper?.preview ??
    (selectedWallpaper?.kind === 'video'
      ? deriveWallpaperPreview(activeWallpaperSrc)
      : undefined)

  return (
    <main className={theme.className}>
      <WallpaperLayer
        src={activeWallpaperSrc}
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
