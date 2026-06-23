import { CalendarDays, MapPin } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'
import { type SchoolTodayData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

export function SchoolTodayWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  const query = useAgentWidget<SchoolTodayData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="School data will appear when the Agent is running." />
  }

  const firstCourse = query.data.data.courses[0]

  return (
    <div className="flex h-full flex-col gap-4" data-endpoint={config.endpoint}>
      {firstCourse ? (
        <div className="rounded-2xl bg-white/12 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {firstCourse.time} - {firstCourse.name}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-white/58">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {firstCourse.location}
          </div>
        </div>
      ) : null}
      {query.data.data.notices.map((notice) => (
        <div key={`${notice.time}-${notice.title}`} className="rounded-2xl bg-white/10 p-3 text-sm text-white/72">
          {notice.title} - {notice.time}
        </div>
      ))}
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
