import { useEffectiveConfig } from '../config/useEffectiveConfig'
import { SearchBar } from '../features/search/SearchBar'
import { SettingsButton } from '../features/settings/SettingsButton'
import { ClockDisplay } from '../features/time/ClockDisplay'
import { WallpaperLayer } from '../layout/WallpaperLayer'
import { useConfigStore } from '../store/useConfigStore'
import { WidgetGrid } from '../layout/WidgetGrid'
import { getTheme } from '../themes/registry'

export function AppShell() {
  const config = useEffectiveConfig()
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const selectedWallpaper = wallpapers.find(
    (item) => item.src === config.wallpaper,
  )
  const theme = getTheme(config.theme)

  return (
    <main className={theme.className}>
      <WallpaperLayer
        src={config.wallpaper}
        kind={selectedWallpaper?.kind}
        preview={selectedWallpaper?.preview}
      />
      <SettingsButton />
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-20">
        <section className="mb-10 pt-4">
          <ClockDisplay />
          <SearchBar engines={config.searchEngines} />
        </section>
        <WidgetGrid widgets={config.widgets} />
      </div>
    </main>
  )
}
