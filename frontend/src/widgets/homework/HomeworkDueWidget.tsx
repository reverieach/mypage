import { Clock3, NotebookTabs, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { Button } from '../../components/ui/button'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope } from '../../data/apiClient'
import { type HomeworkDueData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

function formatDeadline(value: string) {
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

export function HomeworkDueWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<HomeworkDueData>(config)
  const [isRefreshing, setIsRefreshing] = useState(false)

  async function refreshHomework() {
    setIsRefreshing(true)

    try {
      await postAgentEnvelope('/api/homework/refresh')
      await query.refetch()
    } finally {
      setIsRefreshing(false)
    }
  }

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Homework data is read from E:\\作业获取项目 when the Agent is running." />
  }

  const assignments = query.data.data.assignments

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-white/82">
          <NotebookTabs className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {assignments.length} due · {query.data.data.windowLabel}
          </span>
        </div>
        <Button
          aria-label="Refresh homework"
          size="icon"
          variant="ghost"
          onClick={refreshHomework}
          disabled={isRefreshing}
        >
          <RefreshCw
            className={isRefreshing ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
            aria-hidden="true"
          />
        </Button>
      </div>
      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {assignments.length ? (
          assignments.map((assignment) => (
            <div key={assignment.id} className="rounded-2xl bg-white/10 p-3">
              <p className="truncate text-sm font-medium text-white/84">
                {assignment.name}
              </p>
              <p className="mt-1 truncate text-xs text-white/52">
                {assignment.course}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-100/82">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDeadline(assignment.deadline)}
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white/8 text-sm text-white/54">
            No unfinished homework due soon.
          </div>
        )}
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
