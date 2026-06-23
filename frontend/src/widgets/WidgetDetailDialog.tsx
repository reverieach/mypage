import * as DialogPrimitive from '@radix-ui/react-dialog'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

import { Button } from '../components/ui/button'
import type { WidgetConfig } from '../config/types'
import { WidgetRenderer } from './registry'

type WidgetDetailDialogProps = {
  config: WidgetConfig | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WidgetDetailDialog({
  config,
  open,
  onOpenChange,
}: WidgetDetailDialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-transparent" />
        <DialogPrimitive.Content asChild>
          <motion.div
            className="fixed left-1/2 top-1/2 z-50 flex h-[min(680px,calc(100vh-48px))] w-[min(760px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[36px] border border-white/20 bg-slate-950/50 p-6 text-white shadow-glass backdrop-blur-2xl focus:outline-none"
            initial={{ opacity: 0, scale: 0.72, y: 32 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 16 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <DialogPrimitive.Title className="text-2xl font-semibold">
                  {config?.title ?? 'Widget'}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-sm text-white/48">
                  Expanded view
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close asChild>
                <Button aria-label="Close widget" size="icon" variant="ghost">
                  <X className="h-5 w-5" aria-hidden="true" />
                </Button>
              </DialogPrimitive.Close>
            </div>
            <div className="min-h-0 flex-1">
              {config ? <WidgetRenderer config={config} /> : null}
            </div>
          </motion.div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
