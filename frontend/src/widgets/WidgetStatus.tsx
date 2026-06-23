import { AlertCircle, Loader2 } from 'lucide-react'

import type { AgentEnvelope } from '../data/apiClient'

type WidgetLoadingProps = {
  label?: string
}

export function WidgetLoading({ label = 'Loading Agent data' }: WidgetLoadingProps) {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-white/58">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  )
}

export function WidgetError({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/8 p-4 text-center">
      <AlertCircle className="h-5 w-5 text-amber-200" aria-hidden="true" />
      <p className="text-sm font-medium text-white/82">Agent unavailable</p>
      <p className="text-xs leading-5 text-white/54">{message}</p>
    </div>
  )
}

export function WidgetMeta<T>({ envelope }: { envelope: AgentEnvelope<T> }) {
  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-white/42">
      <span>{new Date(envelope.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      {envelope.stale ? (
        <span className="rounded-full bg-amber-300/18 px-2 py-0.5 text-amber-100">
          stale
        </span>
      ) : null}
    </div>
  )
}
