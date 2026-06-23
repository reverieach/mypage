import type { DataWidgetConfig } from '../../config/types'

const heatmapCells = Array.from({ length: 91 }, (_, index) => {
  const value = (index * 7 + index ** 2) % 5
  return value
})

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
  const total = heatmapCells.reduce((sum, cell) => sum + cell, 0)

  return (
    <div
      className="flex h-full flex-col justify-between gap-4"
      data-endpoint={config.endpoint}
    >
      <div>
        <p className="text-3xl font-semibold text-white">{total}</p>
        <p className="text-sm text-white/58">contributions in the last quarter</p>
      </div>
      <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-hidden">
        {heatmapCells.map((level, index) => (
          <span
            key={index}
            className={`aspect-square rounded-[4px] ${colorByLevel[level]}`}
          />
        ))}
      </div>
    </div>
  )
}
