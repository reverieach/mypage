import type { WidgetConfig } from '../config/types'
import { AutomationDigestWidget } from './automation/AutomationDigestWidget'
import { CodexUsageWidget } from './codex/CodexUsageWidget'
import { GitHubHeatmapWidget } from './github/GitHubHeatmapWidget'
import { HomeworkDueWidget } from './homework/HomeworkDueWidget'
import { ImportantInfoWidget } from './important/ImportantInfoWidget'
import { LinksGridWidget } from './links/LinksGridWidget'
import { MailDigestWidget } from './mail/MailDigestWidget'
import { StickyNoteWidget } from './notes/StickyNoteWidget'
import { NotificationsWidget } from './notifications/NotificationsWidget'
import { SchoolNoticesWidget } from './school/SchoolNoticesWidget'
import { SchoolTodayWidget } from './school/SchoolTodayWidget'
import { ScriptStatusWidget } from './scripts/ScriptStatusWidget'
import { WeatherWidget } from './weather/WeatherWidget'

const widgetRegistry = {
  'links.grid': LinksGridWidget,
  'github.heatmap': GitHubHeatmapWidget,
  'school.today': SchoolTodayWidget,
  'codex.usage': CodexUsageWidget,
  'automation.digest': AutomationDigestWidget,
  'scripts.status': ScriptStatusWidget,
  'notifications.center': NotificationsWidget,
  'homework.due': HomeworkDueWidget,
  'school.notices': SchoolNoticesWidget,
  'notes.sticky': StickyNoteWidget,
  'weather.summary': WeatherWidget,
  'mail.digest': MailDigestWidget,
  'important.info': ImportantInfoWidget,
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
    case 'notifications.center': {
      const Component = widgetRegistry['notifications.center']
      return <Component config={config} />
    }
    case 'homework.due': {
      const Component = widgetRegistry['homework.due']
      return <Component config={config} />
    }
    case 'school.notices': {
      const Component = widgetRegistry['school.notices']
      return <Component config={config} />
    }
    case 'notes.sticky': {
      const Component = widgetRegistry['notes.sticky']
      return <Component />
    }
    case 'weather.summary': {
      const Component = widgetRegistry['weather.summary']
      return <Component />
    }
    case 'mail.digest': {
      const Component = widgetRegistry['mail.digest']
      return <Component config={config} />
    }
    case 'important.info': {
      const Component = widgetRegistry['important.info']
      return <Component />
    }
    default:
      return null
  }
}
