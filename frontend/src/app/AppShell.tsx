import { appConfig } from '../config/appConfig'
import { SearchBar } from '../features/search/SearchBar'
import { SettingsButton } from '../features/settings/SettingsButton'
import { WallpaperLayer } from '../layout/WallpaperLayer'
import { WidgetGrid } from '../layout/WidgetGrid'
import { getTheme } from '../themes/registry'

export function AppShell() {
  const theme = getTheme(appConfig.theme)

  return (
    <main className={theme.className}>
      <WallpaperLayer src={appConfig.wallpaper} />
      <SettingsButton />
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-6 py-20">
        <section className="mb-10 pt-4">
          <p className="mb-5 text-center text-sm font-medium text-white/62">
            MyPage
          </p>
          <SearchBar engines={appConfig.searchEngines} />
        </section>
        <WidgetGrid />
      </div>
    </main>
  )
}
