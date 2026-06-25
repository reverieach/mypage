import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  RefreshCw,
  Sun,
  Thermometer,
  Umbrella,
  Wind,
} from 'lucide-react'

import { RefreshStatusButton } from '../../components/ui/refresh-status-button'
import { useRefreshFeedback } from '../../components/ui/useRefreshFeedback'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope } from '../../data/apiClient'
import { type WeatherSummaryData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

function round(value?: number | null) {
  return typeof value === 'number' ? Math.round(value) : null
}

function formatHour(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value.slice(11, 16)
  }

  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    hour12: false,
  }).format(date)
}

function formatDay(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    weekday: 'short',
  }).format(date)
}

function WeatherIcon({
  condition,
  className = 'h-8 w-8',
}: {
  condition?: string
  className?: string
}) {
  if (condition?.includes('thunderstorm')) {
    return <CloudLightning className={className} aria-hidden="true" />
  }

  if (condition?.includes('snow')) {
    return <CloudSnow className={className} aria-hidden="true" />
  }

  if (condition?.includes('rain') || condition?.includes('showers')) {
    return <CloudRain className={className} aria-hidden="true" />
  }

  if (condition?.includes('drizzle')) {
    return <CloudDrizzle className={className} aria-hidden="true" />
  }

  if (condition?.includes('fog')) {
    return <CloudFog className={className} aria-hidden="true" />
  }

  if (condition === 'clear') {
    return <Sun className={className} aria-hidden="true" />
  }

  if (condition === 'partly-cloudy' || condition === 'mainly-clear') {
    return <CloudSun className={className} aria-hidden="true" />
  }

  return <Cloud className={className} aria-hidden="true" />
}

export function WeatherWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<WeatherSummaryData>(config)
  const refresh = useRefreshFeedback()

  function refreshWeather() {
    void refresh.runRefresh(async () => {
      const envelope = await postAgentEnvelope<WeatherSummaryData>('/api/weather/refresh')

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      void query.refetch()
    })
  }

  if (query.isLoading) {
    return <WidgetLoading label="Checking weather" />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Weather needs the local Agent." />
  }

  const data = query.data.data
  const currentTemp = round(data.current.temperature)
  const feelsLike = round(data.current.apparentTemperature)
  const windSpeed = round(data.current.windSpeed)
  const rainChance = round(
    data.hourly.slice(0, 6).reduce((max, item) => {
      return Math.max(max, item.precipitationProbability ?? 0)
    }, 0),
  )
  const nextHours = data.hourly.slice(0, 6)
  const nextDays = data.daily.slice(0, 3)
  const primarySuggestion = data.suggestions[0]

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-amber-100">
              <WeatherIcon
                condition={data.current.condition}
                className="h-7 w-7"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-semibold leading-none text-white">
                  {currentTemp ?? '--'}°
                </p>
                <p className="text-xs text-white/50">体感 {feelsLike ?? '--'}°</p>
              </div>
              <p className="truncate text-xs text-white/58">
                {data.location.label} · {data.current.conditionLabel ?? '天气'}
              </p>
            </div>
          </div>
        </div>
        <RefreshStatusButton
          disabled={refresh.isRefreshing}
          label="Refresh weather"
          onClick={refreshWeather}
          status={refresh.status}
        />
      </div>

      <div className="rounded-2xl bg-white/9 px-3 py-2">
        <p className="line-clamp-2 text-sm leading-5 text-white/78">
          {primarySuggestion?.message ?? data.summary}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-[11px] text-white/58">
        <div className="flex items-center gap-1.5 rounded-xl bg-white/8 px-2 py-1.5">
          <Umbrella className="h-3.5 w-3.5 text-sky-100" aria-hidden="true" />
          <span>{rainChance ?? 0}%</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-white/8 px-2 py-1.5">
          <Wind className="h-3.5 w-3.5 text-white/62" aria-hidden="true" />
          <span>{windSpeed ?? '--'} km/h</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-xl bg-white/8 px-2 py-1.5">
          <Droplets className="h-3.5 w-3.5 text-cyan-100" aria-hidden="true" />
          <span>{round(data.current.humidity) ?? '--'}%</span>
        </div>
      </div>

      <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto">
        <div className="flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-none">
          {nextHours.map((item) => (
            <div
              key={item.time}
              className="flex min-w-12 snap-start flex-col items-center gap-1 rounded-2xl bg-white/8 px-2 py-2 text-center"
            >
              <span className="text-[10px] text-white/42">{formatHour(item.time)}</span>
              <WeatherIcon
                condition={item.condition}
                className="h-4 w-4 text-white/72"
              />
              <span className="text-xs font-medium text-white/78">
                {round(item.temperature) ?? '--'}°
              </span>
              <span className="text-[10px] text-sky-100/80">
                {round(item.precipitationProbability) ?? 0}%
              </span>
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          {nextDays.map((item) => (
            <div key={item.date} className="rounded-2xl bg-white/8 px-2 py-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-white/52">{formatDay(item.date)}</span>
                <WeatherIcon condition={item.condition} className="h-4 w-4 text-white/66" />
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-white/78">
                <Thermometer className="h-3.5 w-3.5 text-white/48" />
                <span>
                  {round(item.temperatureMin) ?? '--'}-{round(item.temperatureMax) ?? '--'}°
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <WidgetMeta envelope={query.data} />
        {data.fromCache ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-white/38">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            cache
          </span>
        ) : null}
      </div>
    </div>
  )
}
