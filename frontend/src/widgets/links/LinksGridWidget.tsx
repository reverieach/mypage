import { Plus } from 'lucide-react'

import type { LinksGridWidgetConfig } from '../../config/types'
import { AddLinkDialog } from './AddLinkDialog'
import { DraggableLinkTile } from './DraggableLinkTile'

export function LinksGridWidget({ config }: { config: LinksGridWidgetConfig }) {
  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="grid grid-cols-3 gap-3">
        {config.links.map((link, index) => (
          <DraggableLinkTile key={link.id} index={index} link={link} />
        ))}
        <AddLinkDialog
          trigger={
            <button
              type="button"
              className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/18 bg-white/8 px-2 py-3 text-center text-white/68 transition hover:-translate-y-0.5 hover:bg-white/16 hover:text-white"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12">
                <Plus className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="w-full truncate text-xs font-medium">Add</span>
            </button>
          }
        />
      </div>
    </div>
  )
}
