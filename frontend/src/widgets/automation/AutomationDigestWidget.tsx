import { CheckCircle2, CircleAlert } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'
import {
  type AutomationDigestData,
  useAgentWidget,
} from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

export function AutomationDigestWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  const query = useAgentWidget<AutomationDigestData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Automation digest needs the local Agent." />
  }

  const data = query.data.data

  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden"
      data-endpoint={config.endpoint}
    >
      <p className="text-sm leading-6 text-white/72">{data.summary}</p>
      <div className="space-y-2 overflow-hidden">
        {data.items.map((item) => {
          const Icon = item.status === 'success' ? CheckCircle2 : CircleAlert

          return (
            <div
              key={`${item.time}-${item.title}`}
              className="flex items-center gap-3 rounded-2xl bg-white/10 px-3 py-2"
            >
              <Icon
                className={
                  item.status === 'success'
                    ? 'h-4 w-4 text-emerald-200'
                    : 'h-4 w-4 text-amber-200'
                }
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white/84">
                  {item.title}
                </p>
                <p className="truncate text-xs text-white/52">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
