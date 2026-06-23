import { useEffect, useState } from 'react'

function getClockParts() {
  const now = new Date()
  return {
    time: new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now),
    date: new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(now),
  }
}

export function ClockDisplay() {
  const [parts, setParts] = useState(() => getClockParts())
  const hour = new Date().getHours()
  const greeting = (() => {
    if (hour < 6) {
      return '夜深了'
    }

    if (hour < 12) {
      return '早上好'
    }

    if (hour < 18) {
      return '下午好'
    }

    return '晚上好'
  })()

  useEffect(() => {
    const timer = window.setInterval(() => setParts(getClockParts()), 1000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <div className="mb-5 text-center text-white drop-shadow-[0_12px_28px_rgba(15,23,42,0.26)]">
      <div className="text-[64px] font-semibold leading-none sm:text-[78px]">
        {parts.time}
      </div>
      <div className="mt-2 text-sm font-medium text-white/72">
        {greeting} · {parts.date}
      </div>
    </div>
  )
}
