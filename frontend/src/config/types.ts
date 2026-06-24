import type { ThemeId } from '../themes/types'

export type WidgetLayout = {
  x: number
  y: number
  w: number
  h: number
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
}

export type SearchEngine = {
  id: string
  label: string
  url: string
  copyQueryToClipboard?: boolean
}

export type QuickLink = {
  id: string
  label: string
  href: string
  category?: string
  icon?: string
}

export type BaseWidgetConfig = {
  id: string
  title: string
  layout: WidgetLayout
}

export type LinksGridWidgetConfig = BaseWidgetConfig & {
  type: 'links.grid'
  links: QuickLink[]
}

export type DataWidgetConfig = BaseWidgetConfig & {
  type:
    | 'github.heatmap'
    | 'school.today'
    | 'codex.usage'
    | 'automation.digest'
    | 'scripts.status'
    | 'notifications.center'
    | 'homework.due'
    | 'school.notices'
    | 'notes.sticky'
    | 'weather.summary'
    | 'mail.digest'
    | 'important.info'
  endpoint?: string
  refreshIntervalMs?: number
}

export type WidgetConfig = LinksGridWidgetConfig | DataWidgetConfig

export type AppConfig = {
  theme: ThemeId
  wallpaper: string
  searchEngines: SearchEngine[]
  widgets: WidgetConfig[]
}
