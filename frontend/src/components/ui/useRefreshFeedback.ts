import { useCallback, useEffect, useRef, useState } from 'react'

export type RefreshStatus = 'idle' | 'loading' | 'success' | 'error'

const feedbackDurationMs = 1200

export function useRefreshFeedback() {
  const [status, setStatus] = useState<RefreshStatus>('idle')
  const resetTimerRef = useRef<number | null>(null)

  const clearResetTimer = useCallback(() => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }
  }, [])

  const runRefresh = useCallback(
    async (action: () => Promise<void>) => {
      clearResetTimer()
      setStatus('loading')

      try {
        await action()
        setStatus('success')
      } catch {
        setStatus('error')
      } finally {
        resetTimerRef.current = window.setTimeout(() => {
          setStatus('idle')
          resetTimerRef.current = null
        }, feedbackDurationMs)
      }
    },
    [clearResetTimer],
  )

  useEffect(
    () => () => {
      clearResetTimer()
    },
    [clearResetTimer],
  )

  return {
    isRefreshing: status === 'loading',
    runRefresh,
    status,
  }
}
