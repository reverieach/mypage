import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Plus,
  Trash2,
  X,
} from 'lucide-react'

import { Button } from '../../components/ui/button'
import type { LinksGridWidgetConfig, QuickLink } from '../../config/types'
import { useConfigStore } from '../../store/useConfigStore'
import { LinkFavicon } from './LinkFavicon'

type LinksFolderDialogProps = {
  config: LinksGridWidgetConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}

function groupLinks(links: QuickLink[]) {
  return links.reduce<Record<string, QuickLink[]>>((groups, link) => {
    const category = link.category?.trim() || 'Other'
    groups[category] = [...(groups[category] ?? []), link]
    return groups
  }, {})
}

export function LinksFolderDialog({
  config,
  open,
  onOpenChange,
}: LinksFolderDialogProps) {
  const addLink = useConfigStore((state) => state.addLink)
  const moveLink = useConfigStore((state) => state.moveLink)
  const removeLink = useConfigStore((state) => state.removeLink)
  const updateLink = useConfigStore((state) => state.updateLink)
  const groupedLinks = groupLinks(config.links)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-md" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex h-[min(760px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[36px] border border-white/20 bg-slate-950/52 p-6 text-white shadow-glass backdrop-blur-2xl focus:outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-2xl font-semibold">
                Links
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-white/52">
                Shortcuts grouped by purpose. Reorder items to change their
                dashboard priority.
              </DialogPrimitive.Description>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  addLink({
                    label: 'New Link',
                    href: 'https://example.com',
                    category: 'Tools',
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add
              </Button>
              <DialogPrimitive.Close asChild>
                <Button aria-label="Close links" size="icon" variant="ghost">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="mt-6 min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="grid gap-5 md:grid-cols-2">
              {Object.entries(groupedLinks).map(([category, links]) => (
                <section
                  key={category}
                  className="rounded-[28px] border border-white/12 bg-white/10 p-4"
                >
                  <h3 className="mb-3 text-sm font-semibold text-white/68">
                    {category}
                  </h3>
                  <div className="space-y-3">
                    {links.map((link) => (
                      <div
                        key={link.id}
                        className="rounded-3xl border border-white/10 bg-white/10 p-3"
                      >
                        <div className="flex items-center gap-3">
                          <LinkFavicon href={link.href} label={link.label} />
                          <div className="min-w-0 flex-1">
                            <input
                              value={link.label}
                              onChange={(event) =>
                                updateLink(link.id, { label: event.target.value })
                              }
                              className="h-9 w-full rounded-full border border-white/12 bg-white/10 px-3 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                            />
                          </div>
                          <a
                            href={link.href}
                            className="flex h-9 w-9 items-center justify-center rounded-full text-white/58 transition hover:bg-white/12 hover:text-white"
                            title={`Open ${link.label}`}
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          </a>
                        </div>
                        <div className="mt-2 grid gap-2 md:grid-cols-[1fr_120px]">
                          <input
                            value={link.href}
                            onChange={(event) =>
                              updateLink(link.id, { href: event.target.value })
                            }
                            className="h-9 rounded-full border border-white/12 bg-white/10 px-3 text-sm text-white/72 focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                          <input
                            value={link.category ?? ''}
                            onChange={(event) =>
                              updateLink(link.id, {
                                category: event.target.value || 'Other',
                              })
                            }
                            className="h-9 rounded-full border border-white/12 bg-white/10 px-3 text-sm text-white/72 focus:outline-none focus:ring-2 focus:ring-white/30"
                          />
                        </div>
                        <div className="mt-2 flex justify-end gap-1">
                          <Button
                            aria-label={`Move ${link.label} up`}
                            size="icon"
                            variant="ghost"
                            onClick={() => moveLink(link.id, -1)}
                          >
                            <ArrowUp className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`Move ${link.label} down`}
                            size="icon"
                            variant="ghost"
                            onClick={() => moveLink(link.id, 1)}
                          >
                            <ArrowDown className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            aria-label={`Remove ${link.label}`}
                            size="icon"
                            variant="ghost"
                            onClick={() => removeLink(link.id)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
