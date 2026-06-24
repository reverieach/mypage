import { useState } from 'react'

import { linkIconUrl } from '../../data/linkIcons'
import { cn } from '../../utils/cn'

type LinkFaviconProps = {
  href: string
  label: string
  className?: string
  onIconError?: () => void
  version?: number
}

export function LinkFavicon({
  href,
  label,
  className,
  onIconError,
  version,
}: LinkFaviconProps) {
  const src = linkIconUrl(href, version)
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const canShowIcon = failedIcon !== src
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
          src={src}
          alt=""
          className="h-6 w-6 rounded-md"
          draggable={false}
          onError={() => {
            setFailedIcon(src)
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
