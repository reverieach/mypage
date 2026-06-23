import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

import type { DataWidgetConfig } from '../../config/types'

const usage = [
  { day: 'Mon', tokens: 48 },
  { day: 'Tue', tokens: 72 },
  { day: 'Wed', tokens: 56 },
  { day: 'Thu', tokens: 91 },
  { day: 'Fri', tokens: 64 },
  { day: 'Sat', tokens: 38 },
  { day: 'Sun', tokens: 84 },
]

export function CodexUsageWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  return (
    <div className="flex h-full flex-col" data-endpoint={config.endpoint}>
      <div>
        <p className="text-3xl font-semibold text-white">156k</p>
        <p className="text-sm text-white/58">tokens today - 8 sessions</p>
      </div>
      <div className="mt-3 min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={usage} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}>
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
    </div>
  )
}
