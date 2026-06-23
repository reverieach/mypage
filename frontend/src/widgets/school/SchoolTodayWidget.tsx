import { CalendarDays, MapPin } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'

export function SchoolTodayWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  return (
    <div className="flex h-full flex-col gap-4" data-endpoint={config.endpoint}>
      <div className="rounded-2xl bg-white/12 p-3">
        <div className="flex items-center gap-2 text-sm font-medium text-white">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          08:00 - 高等数学
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-white/58">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          教学楼 A301
        </div>
      </div>
      <div className="rounded-2xl bg-white/10 p-3 text-sm text-white/72">
        校园网维护通知 - 22:00
      </div>
    </div>
  )
}
