import { Bell, GitPullRequest, Mail, MessageCircle, School } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'
import {
  type NotificationCenterData,
  useAgentWidget,
} from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

const sourceIcons = {
  github: GitPullRequest,
  mail: Mail,
  bilibili: MessageCircle,
  school: School,
  system: Bell,
}

export function NotificationsWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<NotificationCenterData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Notifications will appear after Agent sources are configured." />
  }

  const items = query.data.data.items

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-white/84">
          {items.filter((item) => item.unread).length} unread
        </span>
        <span className="text-xs text-white/46">
          {query.data.data.enabledSources.join(' · ')}
        </span>
      </div>
      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {items.map((item) => {
          const Icon = sourceIcons[item.source]

          return (
            <div
              key={item.id}
              className="flex gap-3 rounded-2xl bg-white/10 px-3 py-2.5"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/68" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/84">
                  {item.title}
                </p>
                <p className="truncate text-xs text-white/52">{item.summary}</p>
              </div>
              {item.unread ? (
                <span className="mt-1 h-2 w-2 rounded-full bg-sky-200" />
              ) : null}
            </div>
          )
        })}
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
