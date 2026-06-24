import * as DialogPrimitive from '@radix-ui/react-dialog'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '../../components/ui/button'
import { cacheLinkIcon } from '../../data/linkIcons'
import { useConfigStore } from '../../store/useConfigStore'
import { inferLinkLabel, normalizeHref } from './linkUtils'

type AddLinkDialogProps = {
  category?: string
  trigger: ReactNode
}

export function AddLinkDialog({ category = 'Tools', trigger }: AddLinkDialogProps) {
  const addLink = useConfigStore((state) => state.addLink)
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState('')
  const [label, setLabel] = useState('')
  const [categoryDraft, setCategoryDraft] = useState(category)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    const normalizedHref = normalizeHref(href)

    if (!normalizedHref || submitting) {
      return
    }

    setSubmitting(true)
    const inferredLabel = label.trim() || inferLinkLabel(normalizedHref)
    let icon: string | undefined

    try {
      const envelope = await cacheLinkIcon(normalizedHref, inferredLabel)
      icon = envelope.data.icon || undefined
    } catch {
      icon = undefined
    }

    addLink({
      href: normalizedHref,
      label: inferredLabel,
      category: categoryDraft.trim() || 'Other',
      icon,
    })
    setHref('')
    setLabel('')
    setSubmitting(false)
    setOpen(false)
  }

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setCategoryDraft(category)
        } else {
          setSubmitting(false)
        }

        setOpen(nextOpen)
      }}
    >
      <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal forceMount>
        <AnimatePresence>
          {open ? (
            <>
              <DialogPrimitive.Overlay forceMount asChild>
                <motion.div
                  key="add-link-overlay"
                  className="fixed inset-0 z-[80] bg-transparent"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.14 }}
                />
              </DialogPrimitive.Overlay>
              <DialogPrimitive.Content forceMount asChild>
                <motion.div
                  key="add-link-panel"
                  className="fixed left-1/2 top-1/2 z-[90] w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[30px] border border-white/18 bg-slate-950/72 p-5 text-white shadow-glass backdrop-blur-2xl focus:outline-none"
                  initial={{ opacity: 0, scale: 0.92, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 14 }}
                  transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                >
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-lg font-semibold">
                  Add site
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-white/52">
                  Name can stay empty. It will be inferred from the URL.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button aria-label="Close" size="icon" variant="ghost">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>

            <div className="mt-5 space-y-3">
              <input
                autoFocus
                value={href}
                onChange={(event) => setHref(event.target.value)}
                placeholder="https://example.com"
                className="h-11 w-full rounded-full border border-white/14 bg-white/10 px-4 text-sm text-white placeholder:text-white/36 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Name"
                className="h-11 w-full rounded-full border border-white/14 bg-white/10 px-4 text-sm text-white placeholder:text-white/36 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <input
                value={categoryDraft}
                onChange={(event) => setCategoryDraft(event.target.value)}
                placeholder="Category"
                className="h-11 w-full rounded-full border border-white/14 bg-white/10 px-4 text-sm text-white placeholder:text-white/36 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            <div className="mt-5 flex justify-end">
              <Button disabled={submitting} onClick={() => void handleSubmit()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {submitting ? 'Adding' : 'Add'}
              </Button>
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
