import { Activity, CheckCircle2 } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'

export function ScriptStatusWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  return (
    <div
      className="flex h-full flex-col justify-between"
      data-endpoint={config.endpoint}
    >
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-300/16 p-3">
        <CheckCircle2 className="h-5 w-5 text-emerald-200" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-white">Agent ready</p>
          <p className="text-xs text-white/54">127.0.0.1:3217</p>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-semibold text-white">5/6</p>
          <p className="text-sm text-white/58">tasks healthy</p>
        </div>
        <Activity className="h-9 w-9 text-white/42" aria-hidden="true" />
      </div>
    </div>
  )
}
