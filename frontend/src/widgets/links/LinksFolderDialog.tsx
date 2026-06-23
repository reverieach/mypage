import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'

import { Button } from '../../components/ui/button'
import type { LinksGridWidgetConfig } from '../../config/types'
import { AddLinkDialog } from './AddLinkDialog'
import { DraggableLinkTile } from './DraggableLinkTile'
import { groupLinks } from './linkUtils'

type LinksFolderDialogProps = {
  config: LinksGridWidgetConfig
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LinksFolderDialog({
  config,
  open,
  onOpenChange,
}: LinksFolderDialogProps) {
  const groupedLinks = groupLinks(config.links)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <DialogPrimitive.Overlay forceMount asChild>
                <motion.div
                  key="links-overlay"
                  className="fixed inset-0 z-40 bg-transparent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content forceMount asChild>
                <motion.div
                  key="links-panel"
                  className="fixed left-1/2 top-1/2 z-50 flex h-[min(760px,calc(100vh-48px))] w-[min(920px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[36px] border border-white/20 bg-slate-950/48 p-6 text-white shadow-glass backdrop-blur-2xl focus:outline-none"
                  initial={{ opacity: 0, scale: 0.68, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.84, y: 24 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
                >
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-2xl font-semibold">
                Links
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-white/52">
                Drag sites to reorder. Each group can grow from here.
              </DialogPrimitive.Description>
            </div>
            <div className="flex gap-2">
              <DialogPrimitive.Close asChild>
                <Button aria-label="Close links" size="icon" variant="ghost">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          </div>

          <div className="scrollbar-none mt-6 min-h-0 flex-1 overflow-y-auto">
            <div className="grid gap-5 md:grid-cols-2">
              {Object.entries(groupedLinks).map(([category, links]) => (
                <section
                  key={category}
                  className="min-h-0 rounded-[28px] border border-white/12 bg-white/10 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-white/72">
                      {category}
                    </h3>
                    <AddLinkDialog
                      category={category}
                      trigger={(
                        <button
                          type="button"
                          className="flex h-8 items-center gap-1 rounded-full border border-white/12 bg-white/10 px-3 text-xs font-medium text-white/70 transition hover:bg-white/18 hover:text-white"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </button>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {links.map((link) => {
                      const globalIndex = config.links.findIndex(
                        (item) => item.id === link.id,
                      )

                      return (
                        <DraggableLinkTile
                          key={link.id}
                          index={globalIndex}
                          link={link}
                          size="large"
                        />
                      )
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
                </motion.div>
              </DialogPrimitive.Content>
            </>
          ) : null}
        </AnimatePresence>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
