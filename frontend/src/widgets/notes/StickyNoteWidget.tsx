import { useEffect, useState } from 'react'

const noteKey = 'mypage-sticky-note'

export function StickyNoteWidget() {
  const [note, setNote] = useState(() => localStorage.getItem(noteKey) ?? '')

  useEffect(() => {
    localStorage.setItem(noteKey, note)
  }, [note])

  return (
    <textarea
      value={note}
      onChange={(event) => setNote(event.target.value)}
      placeholder="写点今天要记住的事"
      className="h-full w-full resize-none rounded-2xl border border-white/10 bg-white/10 p-3 text-sm leading-6 text-white outline-none placeholder:text-white/36 focus:ring-2 focus:ring-white/24"
    />
  )
}
