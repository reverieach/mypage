import type { WidgetConfig } from '../config/types'
import { AutomationDigestWidget } from './automation/AutomationDigestWidget'
import { CodexUsageWidget } from './codex/CodexUsageWidget'
import { GitHubHeatmapWidget } from './github/GitHubHeatmapWidget'
import { LinksGridWidget } from './links/LinksGridWidget'
import { SchoolTodayWidget } from './school/SchoolTodayWidget'
import { ScriptStatusWidget } from './scripts/ScriptStatusWidget'

const widgetRegistry = {
  'links.grid': LinksGridWidget,
  'github.heatmap': GitHubHeatmapWidget,
  'school.today': SchoolTodayWidget,
  'codex.usage': CodexUsageWidget,
  'automation.digest': AutomationDigestWidget,
  'scripts.status': ScriptStatusWidget,
}

export function WidgetRenderer({ config }: { config: WidgetConfig }) {
  switch (config.type) {
    case 'links.grid': {
      const Component = widgetRegistry['links.grid']
      return <Component config={config} />
    }
    case 'github.heatmap': {
      const Component = widgetRegistry['github.heatmap']
      return <Component config={config} />
    }
    case 'school.today': {
      const Component = widgetRegistry['school.today']
      return <Component config={config} />
    }
    case 'codex.usage': {
      const Component = widgetRegistry['codex.usage']
      return <Component config={config} />
    }
    case 'automation.digest': {
      const Component = widgetRegistry['automation.digest']
      return <Component config={config} />
    }
    case 'scripts.status': {
      const Component = widgetRegistry['scripts.status']
      return <Component config={config} />
    }
    default:
      return null
  }
}
