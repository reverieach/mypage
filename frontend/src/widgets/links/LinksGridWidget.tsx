import { ExternalLink } from 'lucide-react'

import type { LinksGridWidgetConfig } from '../../config/types'

export function LinksGridWidget({ config }: { config: LinksGridWidgetConfig }) {
  return (
    <div className="grid h-full grid-cols-3 gap-3 overflow-hidden">
      {config.links.map((link) => (
        <a
          key={link.id}
          href={link.href}
          className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/12 px-2 py-3 text-center transition hover:-translate-y-0.5 hover:bg-white/22"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/18 text-white shadow-soft">
            <ExternalLink className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="w-full truncate text-xs font-medium text-white/82">
            {link.label}
          </span>
        </a>
      ))}
    </div>
  )
}
