import { Check, RefreshCw, X } from 'lucide-react'

import { Button } from './button'
import type { RefreshStatus } from './useRefreshFeedback'

type RefreshStatusButtonProps = {
  label: string
  onClick: () => void
  status: RefreshStatus
  disabled?: boolean
}

export function RefreshStatusButton({
  disabled,
  label,
  onClick,
  status,
}: RefreshStatusButtonProps) {
  const Icon =
    status === 'success' ? Check : status === 'error' ? X : RefreshCw
  const title =
    status === 'success'
      ? 'Refresh succeeded'
      : status === 'error'
        ? 'Refresh failed'
        : label

  return (
    <Button
      aria-label={title}
      disabled={disabled || status === 'loading'}
      onClick={onClick}
      size="icon"
      title={title}
      variant="ghost"
    >
      <Icon
        className={
          status === 'loading'
            ? 'h-4 w-4 animate-spin'
            : status === 'success'
              ? 'h-4 w-4 text-emerald-100'
              : status === 'error'
                ? 'h-4 w-4 text-rose-100'
                : 'h-4 w-4'
        }
        aria-hidden="true"
      />
    </Button>
  )
}
