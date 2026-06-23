import { CheckCircle2, CircleAlert } from 'lucide-react'

import type { DataWidgetConfig } from '../../config/types'

const items = [
  { id: 'school', label: '学校通知同步', status: 'success', detail: '抓取 3 条新通知' },
  { id: 'backup', label: '项目备份', status: 'success', detail: '已完成' },
  { id: 'course', label: '课程表更新', status: 'warning', detail: '登录即将过期' },
]

export function AutomationDigestWidget({
  config,
}: {
  config: DataWidgetConfig
}) {
  return (
    <div
      className="flex h-full flex-col gap-3 overflow-hidden"
      data-endpoint={config.endpoint}
    >
      <p className="text-sm leading-6 text-white/72">
        今日 5 个自动化任务完成，1 个需要关注。
      </p>
      <div className="space-y-2 overflow-hidden">
        {items.map((item) => {
          const Icon = item.status === 'success' ? CheckCircle2 : CircleAlert

          return (
            <div
              key={item.id}
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
                  {item.label}
                </p>
                <p className="truncate text-xs text-white/52">{item.detail}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
