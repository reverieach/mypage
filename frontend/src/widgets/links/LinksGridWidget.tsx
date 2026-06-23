import { Plus } from 'lucide-react'

import type { LinksGridWidgetConfig } from '../../config/types'
import { useConfigStore } from '../../store/useConfigStore'
import { LinkFavicon } from './LinkFavicon'

export function LinksGridWidget({ config }: { config: LinksGridWidgetConfig }) {
  const addLink = useConfigStore((state) => state.addLink)
  const visibleLinks = config.links.slice(0, 8)

  return (
    <div className="grid h-full grid-cols-3 gap-3 overflow-hidden">
      {visibleLinks.map((link) => (
        <a
          key={link.id}
          href={link.href}
          className="group flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/12 px-2 py-3 text-center transition hover:-translate-y-0.5 hover:bg-white/22"
        >
          <LinkFavicon href={link.href} label={link.label} />
          <span className="w-full truncate text-xs font-medium text-white/82">
            {link.label}
          </span>
        </a>
      ))}
      <button
        type="button"
        className="flex min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/18 bg-white/8 px-2 py-3 text-center text-white/68 transition hover:-translate-y-0.5 hover:bg-white/16 hover:text-white"
        onClick={() => addLink()}
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="w-full truncate text-xs font-medium">Add</span>
      </button>
    </div>
  )
}
