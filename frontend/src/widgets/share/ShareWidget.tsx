import { Copy, ExternalLink, FileUp, FolderOpen, KeyRound, Link2, Send, Smartphone, Trash2, Wifi } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '../../components/ui/button'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope, postAgentFormEnvelope } from '../../data/apiClient'
import { type LanShareStatusData, useAgentWidget } from '../../data/widgetData'
import { WidgetError, WidgetLoading, WidgetMeta } from '../WidgetStatus'

function formatSize(size: number) {
  if (!size) {
    return ''
  }

  if (size > 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  if (size > 1024) {
    return `${Math.round(size / 1024)} KB`
  }

  return `${size} B`
}

function fileHref(id: string) {
  return `http://127.0.0.1:3217/api/share/files/${encodeURIComponent(id)}`
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

export function ShareWidget({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<LanShareStatusData>(config)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  async function sendText() {
    if (!text.trim()) {
      return
    }

    setBusy(true)
    try {
      const envelope = await postAgentEnvelope('/api/share/text', { text })

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      setText('')
      setMessage('Sent')
      void query.refetch()
    } finally {
      setBusy(false)
      window.setTimeout(() => setMessage(''), 1200)
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) {
      return
    }

    setBusy(true)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append('file', file)
        const envelope = await postAgentFormEnvelope('/api/share/files', form)

        if (envelope.error) {
          throw new Error(envelope.error)
        }
      }

      setMessage('Uploaded')
      void query.refetch()
    } finally {
      setBusy(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      window.setTimeout(() => setMessage(''), 1200)
    }
  }

  async function clearShare() {
    setBusy(true)
    try {
      await postAgentEnvelope('/api/share/clear')
      void query.refetch()
    } finally {
      setBusy(false)
    }
  }

  if (query.isLoading) {
    return <WidgetLoading label="Checking share" />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Share needs the local Agent." />
  }

  const data = query.data.data
  const url = data.primaryUrl || data.localUrl
  const recentItems = data.items.slice(0, 4)

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-white/84">
            <Wifi className={data.enabled ? 'h-4 w-4 text-emerald-100' : 'h-4 w-4 text-rose-100'} />
            <span>{data.enabled ? 'LAN Share on' : 'Share off'}</span>
          </div>
          <button
            type="button"
            className="mt-1 flex max-w-full items-center gap-1 text-left text-xs text-white/48 transition hover:text-white/78"
            onClick={() => void copyText(url)}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{url}</span>
          </button>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/12 hover:text-white"
          title="Open Share"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-white/9 px-3 py-2 text-sm text-white/72">
          <KeyRound className="h-4 w-4 shrink-0 text-amber-100" />
          <span className="truncate">PIN {data.pin ?? '------'}</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void copyText(data.pin ?? '')}
        >
          <Copy className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              void sendText()
            }
          }}
          placeholder="Paste text..."
          className="min-w-0 rounded-2xl border border-white/10 bg-white/9 px-3 py-2 text-sm text-white outline-none placeholder:text-white/34"
        />
        <Button type="button" size="icon" variant="ghost" disabled={busy} onClick={sendText}>
          <Send className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          <FileUp className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          multiple
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
        />
      </div>

      <div className="scrollbar-none min-h-0 flex-1 space-y-2 overflow-y-auto">
        {recentItems.length ? (
          recentItems.map((item) => (
            <div key={item.id} className="rounded-2xl bg-white/8 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white/78">
                    {item.kind === 'text' ? item.title : item.originalName ?? item.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {item.source} {item.size ? `· ${formatSize(item.size)}` : ''}
                  </p>
                </div>
                {item.kind === 'file' ? (
                  <a
                    href={fileHref(item.id)}
                    className="shrink-0 rounded-full p-1 text-white/44 transition hover:bg-white/12 hover:text-white"
                    title="Open file"
                  >
                    <FolderOpen className="h-4 w-4" />
                  </a>
                ) : (
                  <button
                    type="button"
                    className="shrink-0 rounded-full p-1 text-white/44 transition hover:bg-white/12 hover:text-white"
                    onClick={() => void copyText(item.text ?? '')}
                    title="Copy text"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="flex h-full items-center justify-center rounded-2xl bg-white/8 p-4 text-center text-sm text-white/44">
            <div>
              <Smartphone className="mx-auto mb-2 h-6 w-6 text-white/34" />
              Send text or files from your phone.
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <WidgetMeta envelope={query.data} />
        <div className="flex items-center gap-2 text-[11px] text-white/46">
          {message ? <span>{message}</span> : null}
          <button
            type="button"
            className="rounded-full p-1 text-white/34 transition hover:bg-white/12 hover:text-white/72"
            onClick={clearShare}
            title="Clear share"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
