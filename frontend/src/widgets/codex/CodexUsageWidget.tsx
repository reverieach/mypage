import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

import type { DataWidgetConfig } from '../../config/types'
import {
  type CodexUsageData,
  formatTokenCount,
  useAgentWidget,
} from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

export function CodexUsageWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  const query = useAgentWidget<CodexUsageData>(config)

  if (query.isLoading) {
    return <WidgetLoading />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Codex usage needs the local Agent endpoint." />
  }

  const data = query.data.data

  return (
    <div className="flex h-full flex-col" data-endpoint={config.endpoint}>
      <div>
        <p className="text-3xl font-semibold text-white">
          {formatTokenCount(data.totalTokens)}
        </p>
        <p className="text-sm text-white/58">
          tokens today - {data.sessions} sessions
        </p>
      </div>
      <div className="mt-3 min-h-32 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data.trend}
            margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="codexTokens" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.75} />
                <stop offset="95%" stopColor="#93c5fd" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.24)' }}
              contentStyle={{
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: 16,
                background: 'rgba(15,23,42,0.8)',
                color: '#fff',
              }}
            />
            <Area
              dataKey="tokens"
              stroke="#bfdbfe"
              strokeWidth={2}
              fill="url(#codexTokens)"
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <WidgetMeta envelope={query.data} />
    </div>
  )
}
