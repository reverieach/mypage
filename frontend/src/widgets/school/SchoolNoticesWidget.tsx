import { CalendarClock, ExternalLink, School, X } from 'lucide-react'

import { RefreshStatusButton } from '../../components/ui/refresh-status-button'
import { useRefreshFeedback } from '../../components/ui/useRefreshFeedback'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope } from '../../data/apiClient'
import { type SchoolNoticesData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

function formatDate(value?: string | null) {
  if (!value) {
    return null
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  }).format(date)
}

function importanceClass(
  importance: SchoolNoticesData['items'][number]['importance'],
) {
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

export function SchoolNoticesWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<SchoolNoticesData>(config)
  const refresh = useRefreshFeedback()

  async function refreshNotices() {
    void refresh.runRefresh(async () => {
      const envelope = await postAgentEnvelope('/api/school/notices/refresh')

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      await query.refetch()
    })
  }

  async function dismissNotice(id: string) {
    await postAgentEnvelope(`/api/school/notices/${encodeURIComponent(id)}/dismiss`)
    await query.refetch()
  }

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="School notices need the local Agent and saved BUPT auth headers." />
  }

  const data = query.data.data

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/82">
          <School className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {data.items.length} relevant · {data.windowLabel}
            {data.hiddenCount ? ` · ${data.hiddenCount} hidden` : ''}
          </span>
        </div>
        <RefreshStatusButton
          disabled={refresh.isRefreshing}
          label="Refresh school notices"
          onClick={refreshNotices}
          status={refresh.status}
        />
      </div>

      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {data.items.length ? (
          data.items.map((item) => {
            const deadline = formatDate(item.deadline)
            const publishedAt = formatDate(item.publishedAt)

            return (
              <a
                key={item.id}
                href={item.webLink}
                target="_blank"
                rel="noreferrer"
                className="block rounded-2xl bg-white/10 px-3 py-2.5 transition hover:bg-white/16"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-medium text-white/84">
                    {item.title}
                  </p>
                  <div className="flex shrink-0 items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5 text-white/42" />
                    <button
                      type="button"
                      aria-label="Hide school notice"
                      className="-mr-1 rounded-full p-1 text-white/34 transition hover:bg-white/12 hover:text-white/78"
                      onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        void dismissNotice(item.id)
                      }}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-white/62">
                  {item.summary}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/46">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {item.department ? `${item.department} · ` : ''}
                      {publishedAt ? `发布 ${publishedAt}` : '发布时间未知'}
                      {deadline ? ` · 截止 ${deadline}` : ''}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${importanceClass(
                      item.importance,
                    )}`}
                  >
                    {item.category}
                  </span>
                </div>
              </a>
            )
          })
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white/8 p-4 text-center text-sm text-white/54">
            {query.data.error ?? 'No relevant BUPT notices in the last two days.'}
          </div>
        )}
      </div>

      <WidgetMeta envelope={query.data} />
    </div>
  )
}
