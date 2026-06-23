import { ChevronDown, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { SearchEngine } from '../../config/types'

type SearchBarProps = {
  engines: SearchEngine[]
}

function buildSearchUrl(rawQuery: string, engine: SearchEngine) {
  const query = rawQuery.trim()

  if (!query) {
    return null
  }

  return engine.url.replace('{query}', encodeURIComponent(query))
}

export function SearchBar({ engines }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [selectedEngineId, setSelectedEngineId] = useState(
    engines[0]?.id ?? 'bing',
  )
  const inputRef = useRef<HTMLInputElement>(null)
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const url = buildSearchUrl(query, selectedEngine)

    if (url) {
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
          type="button"
          className="flex h-10 items-center gap-2 rounded-full border border-white/12 bg-white/12 px-3 text-sm font-medium text-white/78 transition hover:bg-white/20"
          onClick={() => setIsMenuOpen((value) => !value)}
        >
          {selectedEngine.label}
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </button>
        {isMenuOpen ? (
          <div className="absolute right-0 top-12 z-30 w-44 overflow-hidden rounded-3xl border border-white/14 bg-slate-950/70 p-1 shadow-glass backdrop-blur-2xl">
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
                {engine.id === selectedEngine.id ? (
                  <span className="h-2 w-2 rounded-full bg-white/78" />
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </form>
  )
}
