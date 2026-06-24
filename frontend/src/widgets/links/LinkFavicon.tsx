import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../utils/cn'

type LinkFaviconProps = {
  icon?: string
  label: string
  className?: string
}

export function LinkFavicon({ icon, label, className }: LinkFaviconProps) {
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const canShowIcon = Boolean(icon) && failedIcon !== icon

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
          onError={() => setFailedIcon(icon ?? null)}
        />
      ) : (
        <ExternalLink className="h-5 w-5" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
