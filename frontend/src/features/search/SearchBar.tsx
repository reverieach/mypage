import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { createPortal } from 'react-dom'

import type { SearchEngine } from '../../config/types'
import { useConfigStore } from '../../store/useConfigStore'

type SearchBarProps = {
  engines: SearchEngine[]
}

function buildSearchUrl(rawQuery: string, engine: SearchEngine) {
  const query = rawQuery.trim()

  if (!query) {
    return null
  }

  return engine.url.replaceAll('{query}', encodeURIComponent(query))
}

export function SearchBar({ engines }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 176 })
  const selectedEngineId = useConfigStore((state) => state.searchEngineId)
  const setSelectedEngineId = useConfigStore((state) => state.setSearchEngineId)
  const inputRef = useRef<HTMLInputElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const selectedEngine =
    engines.find((engine) => engine.id === selectedEngineId) ?? engines[0]

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === '/' && document.activeElement !== inputRef.current) {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  useEffect(() => {
    if (!isMenuOpen) {
      return
    }

    function syncPosition() {
      const rect = menuButtonRef.current?.getBoundingClientRect()

      if (!rect) {
        return
      }

      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, rect.right - 176),
        width: 176,
      })
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node

      if (
        menuButtonRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return
      }

      setIsMenuOpen(false)
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsMenuOpen(false)
      }
    }

    syncPosition()
    window.addEventListener('resize', syncPosition)
    window.addEventListener('scroll', syncPosition, true)
    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('resize', syncPosition)
      window.removeEventListener('scroll', syncPosition, true)
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isMenuOpen])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedEngine) {
      return
    }

    const url = buildSearchUrl(query, selectedEngine)

    if (url) {
      if (selectedEngine.copyQueryToClipboard) {
        try {
          await navigator.clipboard.writeText(query.trim())
        } catch {
          // Clipboard is a convenience fallback; navigation should still work.
        }
      }

      window.location.href = url
    }
  }

  return (
    <form
      className="relative mx-auto flex h-16 w-full max-w-3xl items-center gap-4 rounded-[32px] border border-white/25 bg-white/18 px-6 shadow-glass backdrop-blur-2xl"
      onSubmit={handleSubmit}
    >
      <Search className="h-6 w-6 shrink-0 text-white/80" aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search"
        className="h-10 min-w-0 flex-1 bg-transparent text-xl font-medium text-white placeholder:text-white/68 focus:outline-none"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="relative">
        <button
          ref={menuButtonRef}
          type="button"
          className="flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/12 px-3 text-sm font-medium text-white/78 transition hover:bg-white/20"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          {selectedEngine?.label ?? 'Search'}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {isMenuOpen
          ? createPortal(
              <div
                ref={menuRef}
                className="fixed z-[90] overflow-hidden rounded-3xl border border-white/14 bg-slate-950/78 p-1 text-white shadow-glass backdrop-blur-2xl"
                style={{
                  left: menuPosition.left,
                  top: menuPosition.top,
                  width: menuPosition.width,
                }}
              >
                {engines.map((engine) => (
                  <button
                    key={engine.id}
                    type="button"
                    className="flex h-10 w-full items-center justify-between rounded-2xl px-3 text-left text-sm text-white/76 transition hover:bg-white/12"
                    onClick={() => {
                      setSelectedEngineId(engine.id)
                      setIsMenuOpen(false)
                      inputRef.current?.focus()
                    }}
                  >
                    {engine.label}
                    {engine.id === selectedEngine?.id ? (
                      <span className="h-2 w-2 rounded-full bg-white/78" />
                    ) : null}
                  </button>
                ))}
              </div>,
              document.body,
            )
          : null}
      </div>
    </form>
  )
}
