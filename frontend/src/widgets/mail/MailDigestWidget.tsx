import { ExternalLink, Mail, RefreshCw, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../components/ui/button'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope } from '../../data/apiClient'
import { type MailSummaryData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

function formatMailTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function importanceClass(importance: MailSummaryData['items'][number]['importance']) {
  if (importance === 'critical') {
    return 'bg-rose-300/18 text-rose-100'
  }

  if (importance === 'important') {
    return 'bg-amber-300/18 text-amber-100'
  }

  if (importance === 'low') {
    return 'bg-white/8 text-white/44'
  }

  return 'bg-white/12 text-white/62'
}

export function MailDigestWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<MailSummaryData>(config)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function refreshMail() {
    setIsRefreshing(true)

    try {
      await postAgentEnvelope('/api/mail/refresh')
      await query.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  async function dismissMail(id: string) {
    await postAgentEnvelope(`/api/mail/messages/${encodeURIComponent(id)}/dismiss`)
    await query.refetch()
  }

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Mail data will appear after the local Agent is running." />
  }

  const data = query.data.data

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/82">
          <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {data.configured
              ? `${data.importantCount} important${
                  data.hiddenCount ? ` · ${data.hiddenCount} hidden` : ''
                }`
              : 'Mail not configured'}
          </span>
        </div>
        <Button
          aria-label="Refresh mail"
          size="icon"
          variant="ghost"
          onClick={refreshMail}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            aria-hidden="true"
          />
        </Button>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {data.items.length ? (
          data.items.map((item) => (
            <a
              key={item.id}
              href={item.webLink ?? undefined}
              target={item.webLink ? '_blank' : undefined}
              rel={item.webLink ? 'noreferrer' : undefined}
              className="block rounded-2xl bg-white/10 px-3 py-2.5 transition hover:bg-white/16"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/84">
                  {item.title}
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  {item.webLink ? (
                    <ExternalLink className="h-3.5 w-3.5 text-white/42" />
                  ) : null}
                  <button
                    type="button"
                    aria-label="Hide mail"
                    className="-mr-1 rounded-full p-1 text-white/34 transition hover:bg-white/12 hover:text-white/78"
                    onClick={(event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      void dismissMail(item.id)
                    }}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
              <p className="mt-1 truncate text-xs text-white/48">
                {item.accountLabel} · {item.accountEmail}
              </p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/62">
                {item.summary}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${importanceClass(
                    item.importance,
                  )}`}
                >
                  {item.importance}
                </span>
                <span className="text-[11px] text-white/38">
                  {formatMailTime(item.receivedAt)}
                </span>
              </div>
            </a>
          ))
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white/8 p-4 text-center text-sm text-white/54">
            {data.error
              ? data.error
              : data.configured
              ? 'No analyzed mail yet. Refresh to sync new messages.'
              : 'Add IMAP accounts to the local Agent config.'}
          </div>
        )}
      </div>

      <WidgetMeta envelope={query.data} />
    </div>
  )
}
