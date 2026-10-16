import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { ExternalLink, Mail, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { RefreshStatusButton } from '../../components/ui/refresh-status-button'
import { useRefreshFeedback } from '../../components/ui/useRefreshFeedback'
import type { DataWidgetConfig } from '../../config/types'
import { fetchAgentEnvelope, postAgentEnvelope } from '../../data/apiClient'
import { type MailSummaryData, useAgentWidget } from '../../data/widgetData'
import type { WidgetRenderMode } from '../registry'
import { WidgetError, WidgetLoading } from '../WidgetStatus'

type MailView = 'priority' | 'unread'

function formatMailTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function importanceClass(importance: MailSummaryData['items'][number]['importance']) {
  if (importance === 'critical') return 'bg-rose-300/18 text-rose-100'
  if (importance === 'important') return 'bg-amber-300/18 text-amber-100'
  if (importance === 'low') return 'bg-white/8 text-white/44'
  return 'bg-white/12 text-white/62'
}

function filterLabel(reason?: string | null) {
  const labels: Record<string, string> = {
    low_priority: '低优先级',
    marketing_pattern: '营销特征',
    shopping: '购物',
    promotion: '推广',
    newsletter: 'Newsletter',
    spam: '垃圾邮件',
    marketing: '营销',
  }
  return reason ? labels[reason] ?? reason : null
}

export function MailDigestWidget({
  config,
  mode = 'compact',
}: {
  config: DataWidgetConfig
  mode?: WidgetRenderMode
}) {
  const [view, setView] = useState<MailView>('priority')
  const [feedback, setFeedback] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const actionInFlight = useRef(false)
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(''), 4500)
    return () => window.clearTimeout(timer)
  }, [feedback])
  const summaryQuery = useAgentWidget<MailSummaryData>(config)
  const detailQuery = useQuery({
    queryKey: ['mail-messages', view],
    queryFn: () =>
      fetchAgentEnvelope<MailSummaryData>(
        `/api/mail/messages?view=${view}&limit=100`,
      ),
    enabled: mode === 'detail',
    staleTime: 30_000,
    refetchInterval: 15_000,
  })
  const refresh = useRefreshFeedback()
  const query = mode === 'detail' ? detailQuery : summaryQuery

  async function refreshViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['mail-messages'] }),
      queryClient.invalidateQueries({ predicate: ({ queryKey }) =>
        queryKey[0] === 'agent-widget' && ['/api/mail/summary', '/api/notifications'].includes(String(queryKey[2])) }),
    ])
  }

  async function refreshMail() {
    void refresh.runRefresh(async () => {
      try {
        const envelope = await postAgentEnvelope<{ busy?: boolean }>('/api/mail/refresh')
        await refreshViews()
        if (envelope.error) throw new Error(envelope.error)
        if (envelope.data.busy) setFeedback('正在收信，稍后自动更新')
      } catch (error) {
        setFeedback('收信失败，已保留最近邮件')
        throw error
      }
    })
  }

  async function markMailRead(id: string) {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setPendingId(id)
    try {
      const result = await postAgentEnvelope(`/api/mail/messages/${encodeURIComponent(id)}/read`)
      if (result.error) throw new Error(result.error)
      await refreshViews()
    } catch {
      setFeedback('未能标为已读，请重试')
    } finally {
      actionInFlight.current = false
      setPendingId(null)
    }
  }

  if (query.isLoading) return <WidgetLoading />
  if (query.isError || !query.data) {
    return <WidgetError message="Mail data will appear after the local Agent is running." />
  }

  const data = query.data.data
  const counts = data.counts ?? {
    priority: data.items.length,
    unread: data.items.length + (data.hiddenCount ?? 0),
    filtered: data.hiddenCount ?? 0,
  }
  const lastSync = data.accounts.map(account => account.lastSyncAt).filter((value): value is string => Boolean(value)).sort()[0]

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/82">
          <Mail className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {data.configured
              ? mode === 'detail'
                ? `${counts.unread} 封未读 · ${counts.filtered} 封已筛选`
                : `${counts.priority} 封待阅${data.importantCount ? ` · ${data.importantCount} 封重要` : ''}`
              : '邮箱待连接'}
          </span>
        </div>
        <RefreshStatusButton
          disabled={refresh.isRefreshing}
          label="立即收信"
          onClick={refreshMail}
          status={refresh.status}
        />
      </div>

      {feedback ? <p role="status" className="text-xs text-amber-100/80">{feedback}</p> : null}

      {mode === 'detail' ? (
        <div className="grid grid-cols-2 rounded-lg bg-white/8 p-1">
          {([
            ['priority', `重点 ${counts.priority}`],
            ['unread', `全部未读 ${counts.unread}`],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`h-9 rounded-md text-sm transition ${
                view === value
                  ? 'bg-white/18 text-white shadow-sm'
                  : 'text-white/52 hover:text-white/78'
              }`}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'detail' ? <div className="space-y-1 text-xs text-white/50">
        {data.accounts.map(account => <p key={account.id} title={account.lastError ?? undefined}>
          {account.label} · {account.lastError ? '同步失败' : account.lastSyncAt ? `同步于 ${formatMailTime(account.lastSyncAt)}` : '等待首次同步'}
        </p>)}
      </div> : null}

      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        <AnimatePresence mode="popLayout" initial={false}>
          {data.items.length ? (
            data.items.map((item) => {
              const hiddenReason = filterLabel(item.filterReason)
              return (
                <motion.a
                  layout
                  key={item.id}
                  href={item.webLink ?? undefined}
                  target={item.webLink ? '_blank' : undefined}
                  rel={item.webLink ? 'noreferrer' : undefined}
                  className="block rounded-lg bg-white/10 px-3 py-2.5 transition hover:bg-white/16"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
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
                        aria-label="标为已读"
                        title={pendingId === item.id ? '正在处理…' : '标为已读'}
                        disabled={pendingId !== null}
                        className="-mr-1 rounded-full p-1 text-white/34 transition hover:bg-white/12 hover:text-white/78 disabled:opacity-30"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void markMailRead(item.id)
                        }}
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-xs text-white/48">
                    {item.sender} · {item.accountLabel}{mode === 'detail' ? ` · ${item.accountEmail}` : ''}
                  </p>
                  <p className={`mt-1 text-xs leading-5 text-white/62 ${mode === 'detail' ? 'line-clamp-3' : 'line-clamp-2'}`}>
                    {item.summary}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] ${importanceClass(item.importance)}`}>
                        {{ critical: '紧急', important: '重要', normal: '普通', low: '低优先级' }[item.importance]}
                      </span>
                      {hiddenReason ? (
                        <span className="truncate rounded-full bg-white/8 px-2 py-0.5 text-[11px] text-white/46">
                          {hiddenReason}
                        </span>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-white/38">
                      {formatMailTime(item.receivedAt)}
                    </span>
                  </div>
                </motion.a>
              )
            })
          ) : (
            <motion.div
              key={`empty-${view}`}
              className="flex h-full items-center justify-center rounded-lg bg-white/8 p-4 text-center text-sm text-white/54"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {data.error
                ? data.error
                : data.configured
                  ? view === 'priority'
                    ? '没有需要关注的未读邮件。'
                    : '没有未读邮件。'
                  : '连接邮箱后，邮件会自动显示在这里。'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-white/42">
        <span>{lastSync ? `同步于 ${formatMailTime(lastSync)}` : '尚未同步'}</span>
        {data.error ? <span title={data.error} className="text-amber-100/80">同步异常</span> : null}
      </div>
    </div>
  )
}
