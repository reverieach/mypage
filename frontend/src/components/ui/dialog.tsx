import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ComponentPropsWithoutRef } from 'react'

import { cn } from '../../utils/cn'
import { Button } from './button'

export function Dialog(props: ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root {...props} />
}

export function DialogTrigger(
  props: ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>,
) {
  return <DialogPrimitive.Trigger {...props} />
}

export function DialogContent({
  children,
  className,
  ...props
}: ComponentPropsWithoutRef<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="dialog-overlay-motion fixed inset-0 z-40 bg-slate-950/35 backdrop-blur-sm" />
      <DialogPrimitive.Content
        className={cn(
          'dialog-content-motion fixed right-5 top-5 z-50 flex max-h-[calc(100vh-40px)] w-[440px] max-w-[calc(100vw-40px)] flex-col overflow-hidden rounded-[30px] border border-white/18 bg-slate-950/45 p-5 text-white shadow-glass backdrop-blur-2xl focus:outline-none',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            aria-label="Close settings"
            className="absolute right-4 top-4"
            size="icon"
            variant="ghost"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogTitle(
  props: ComponentPropsWithoutRef<typeof DialogPrimitive.Title>,
) {
  return <DialogPrimitive.Title {...props} />
}

export function DialogDescription(
  props: ComponentPropsWithoutRef<typeof DialogPrimitive.Description>,
) {
  return <DialogPrimitive.Description {...props} />
}
