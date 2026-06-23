import { Bell, GitPullRequest, Mail, MessageCircle, School, X } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope } from '../../data/apiClient'
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

  async function dismissMail(messageId: string) {
    await postAgentEnvelope(
      `/api/mail/messages/${encodeURIComponent(messageId)}/dismiss`,
    )
    await query.refetch()
  }

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
            <a
              key={item.id}
              href={item.webLink ?? undefined}
              target={item.webLink ? '_blank' : undefined}
              rel={item.webLink ? 'noreferrer' : undefined}
              className="flex gap-3 rounded-2xl bg-white/10 px-3 py-2.5"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-white/68" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white/84">
                  {item.title}
                </p>
                <p className="truncate text-xs text-white/52">
                  {item.accountEmail ? `${item.accountEmail} · ` : null}
                  {item.summary}
                </p>
              </div>
              {item.unread ? (
                <span className="mt-1 h-2 w-2 rounded-full bg-sky-200" />
              ) : null}
              {item.source === 'mail' ? (
                <button
                  type="button"
                  aria-label="Hide mail notification"
                  className="-mr-1 self-start rounded-full p-1 text-white/34 transition hover:bg-white/12 hover:text-white/78"
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void dismissMail(item.sourceItemId ?? item.id)
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </a>
          )
        })}
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
