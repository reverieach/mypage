import { CloudSun } from 'lucide-react'

export function WeatherWidget() {
  return (
    <div className="flex h-full flex-col justify-between rounded-2xl bg-white/8 p-3">
      <div className="flex items-center gap-3">
        <CloudSun className="h-8 w-8 text-amber-100" aria-hidden="true" />
        <div>
          <p className="text-2xl font-semibold text-white">--°</p>
          <p className="text-xs text-white/50">Weather source not set</p>
        </div>
      </div>
      <p className="text-xs leading-5 text-white/52">
        Ready for a local weather script or API cache.
      </p>
    </div>
  )
}
