import { ExternalLink } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../../utils/cn'

type LinkFaviconProps = {
  href: string
  label: string
  className?: string
}

function getFaviconUrl(href: string) {
  try {
    const url = new URL(href)
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=64`
  } catch {
    return null
  }
}

export function LinkFavicon({ href, label, className }: LinkFaviconProps) {
  const [failed, setFailed] = useState(false)
  const favicon = getFaviconUrl(href)

  return (
    <span
      className={cn(
        'flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/18 text-white shadow-soft',
        className,
      )}
    >
      {favicon && !failed ? (
        <img
          src={favicon}
          alt=""
          className="h-6 w-6 rounded-md"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <ExternalLink className="h-5 w-5" aria-hidden="true" />
      )}
      <span className="sr-only">{label}</span>
    </span>
  )
}
