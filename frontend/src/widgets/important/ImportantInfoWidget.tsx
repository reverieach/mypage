import { Pin } from 'lucide-react'

export function ImportantInfoWidget() {
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-medium text-white/82">
        <Pin className="h-4 w-4" aria-hidden="true" />
        Important
      </div>
      <div className="grid min-h-0 flex-1 gap-2 overflow-y-auto pr-1">
        {['校园事务', '待办提醒', '常用号码'].map((item) => (
          <div key={item} className="rounded-2xl bg-white/10 px-3 py-2 text-sm text-white/70">
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}
