import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../utils/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70',
  {
    variants: {
      variant: {
        glass:
          'border border-white/25 bg-white/20 text-white shadow-glass backdrop-blur-xl hover:bg-white/30',
        ghost: 'text-white/80 hover:bg-white/15 hover:text-white',
        solid: 'bg-white text-slate-950 shadow-soft hover:bg-white/90',
      },
      size: {
        icon: 'h-10 w-10',
        sm: 'h-9 px-4',
        md: 'h-11 px-5',
      },
    },
    defaultVariants: {
      variant: 'glass',
      size: 'md',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}
