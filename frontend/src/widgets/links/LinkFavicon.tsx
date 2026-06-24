import { useState } from 'react'

import { cn } from '../../utils/cn'

type LinkFaviconProps = {
  icon?: string
  label: string
  className?: string
  onIconError?: () => void
}

export function LinkFavicon({
  icon,
  label,
  className,
  onIconError,
}: LinkFaviconProps) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const canShowIcon = Boolean(icon) && failedIcon !== icon
  const fallbackLabel = label.trim().slice(0, 1).toUpperCase() || '?'

  return (
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/18 text-white shadow-soft',
        className,
      )}
    >
      {canShowIcon ? (
        <img
          src={icon}
          alt=""
          className="h-6 w-6 rounded-md"
          draggable={false}
          onError={() => {
            setFailedIcon(icon ?? null)
            onIconError?.()
          }}
        />
      ) : (
        <span className="text-sm font-semibold text-white/84" aria-hidden="true">
          {fallbackLabel}
        </span>
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
