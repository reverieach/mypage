import type { DataWidgetConfig } from '../../config/types'
import {
  type GitHubContributionsData,
  useAgentWidget,
} from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

const colorByLevel = [
  'bg-white/14',
  'bg-emerald-200/45',
  'bg-emerald-300/60',
  'bg-emerald-400/75',
  'bg-emerald-300',
]

export function GitHubHeatmapWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  const query = useAgentWidget<GitHubContributionsData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Start the local Agent on 127.0.0.1:3217." />
  }

  const { data } = query.data

  return (
    <div
      className="flex h-full flex-col justify-between gap-4"
      data-endpoint={config.endpoint}
    >
      <div>
        <p className="text-3xl font-semibold text-white">{data.total}</p>
        <p className="text-sm text-white/58">
          contributions in the {data.rangeLabel}
        </p>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-hidden">
        {data.days.map((day) => (
          <span
            key={day.date}
            className={`aspect-square rounded-[4px] ${colorByLevel[day.level] ?? colorByLevel[0]}`}
            title={`${day.date}: ${day.count}`}
          />
        ))}
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
