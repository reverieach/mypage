import { useConfigStore } from '../../store/useConfigStore'

export function StickyNoteWidget() {
  const note = useConfigStore((state) => state.note)
  const setNote = useConfigStore((state) => state.setNote)

  return (
    <textarea
      value={note}
      onChange={(event) => setNote(event.target.value)}
      placeholder="写点今天要记住的事"
      className="h-full w-full resize-none rounded-2xl border border-white/10 bg-white/10 p-3 text-sm leading-6 text-white outline-none placeholder:text-white/36 focus:ring-2 focus:ring-white/24"
    />
  )
}
