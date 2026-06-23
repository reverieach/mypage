import { Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import type { SearchEngine } from '../../config/types'

type SearchBarProps = {
  engines: SearchEngine[]
}

function buildSearchUrl(rawQuery: string, engines: SearchEngine[]) {
  const query = rawQuery.trim()
  const [maybePrefix, ...rest] = query.split(/\s+/)
  const prefixedEngine = engines.find((engine) => engine.prefix === maybePrefix)
  const engine = prefixedEngine ?? engines[0]
  const searchText = prefixedEngine ? rest.join(' ') : query

  if (!searchText) {
    return null
  }

  return engine.url.replace('{query}', encodeURIComponent(searchText))
}

export function SearchBar({ engines }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const hints = useMemo(
    () =>
      engines
        .filter((engine) => engine.prefix)
        .map((engine) => `${engine.prefix} ${engine.label}`)
        .join('  ·  '),
    [engines],
  )

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
    const url = buildSearchUrl(query, engines)

    if (url) {
      window.location.href = url
    }
  }

  return (
    <form
      className="mx-auto flex w-full max-w-3xl items-center gap-4 rounded-[32px] border border-white/25 bg-white/18 px-6 py-4 shadow-glass backdrop-blur-2xl"
      onSubmit={handleSubmit}
    >
      <Search className="h-6 w-6 shrink-0 text-white/80" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search"
          className="h-9 w-full bg-transparent text-xl font-medium text-white placeholder:text-white/68 focus:outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <p className="mt-1 truncate text-xs text-white/54">{hints}</p>
      </div>
    </form>
  )
}
