import { useEffectiveConfig } from '../config/useEffectiveConfig'
import { SearchBar } from '../features/search/SearchBar'
import { SettingsButton } from '../features/settings/SettingsButton'
import { ClockDisplay } from '../features/time/ClockDisplay'
import { WallpaperLayer } from '../layout/WallpaperLayer'
import { WidgetGrid } from '../layout/WidgetGrid'
import { getTheme } from '../themes/registry'

export function AppShell() {
  const config = useEffectiveConfig()
  const theme = getTheme(config.theme)

  return (
    <main className={theme.className}>
      <WallpaperLayer src={config.wallpaper} />
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
