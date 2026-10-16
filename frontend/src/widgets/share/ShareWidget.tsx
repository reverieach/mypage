import {
  Check,
  Copy,
  File as FileIcon,
  FileText,
  FileUp,
  FolderOpen,
  Image,
  KeyRound,
  Link2,
  QrCode,
  Send,
  Smartphone,
  Trash2,
  Wifi,
} from 'lucide-react'
import QRCode from 'qrcode'
import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog'
import type { DataWidgetConfig } from '../../config/types'
import { postAgentEnvelope, postAgentFormEnvelope } from '../../data/apiClient'
import { type LanShareItem, type LanShareStatusData, useAgentWidget } from '../../data/widgetData'
import { cn } from '../../utils/cn'
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

function formatTime(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function fileHref(id: string) {
  return `http://127.0.0.1:3217/api/share/files/${encodeURIComponent(id)}`
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value)
}

function clipboardImageFiles(event: ClipboardEvent<HTMLInputElement>) {
  const files: File[] = []
  const items = Array.from(event.clipboardData.items)

  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) {
      continue
    }

    const file = item.getAsFile()

    if (!file) {
      continue
    }

    const extension =
      file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    const name =
      file.name ||
      `clipboard-image-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`

    files.push(new globalThis.File([file], name, { type: file.type }))
  }

  if (files.length) {
    return files
  }

  return Array.from(event.clipboardData.files).filter((file) =>
    file.type.startsWith('image/'),
  )
}

function ShareItemIcon({ item }: { item: LanShareItem }) {
  if (item.kind === 'text') {
    return <FileText className="h-4 w-4" />
  }

  if (item.isImage) {
    return <Image className="h-4 w-4" />
  }

  return <FileIcon className="h-4 w-4" />
}

function ShareItemCard({
  item,
  onCopy,
  onCopyFile,
  onDelete,
  onOpenFile,
}: {
  item: LanShareItem
  onCopy: (value: string) => void
  onCopyFile: (id: string) => void
  onDelete: (id: string) => void
  onOpenFile: (id: string) => void
}) {
  const title = item.kind === 'text' ? item.title : item.originalName ?? item.title

  return (
    <div className="group flex min-h-[226px] flex-col rounded-2xl bg-white/8 p-2.5 transition hover:bg-white/11">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-white/8 p-1.5 text-white/42">
          <ShareItemIcon item={item} />
        </span>
        <button
          type="button"
          className="shrink-0 rounded-full p-1 text-white/28 opacity-0 transition hover:bg-white/12 hover:text-white/76 group-hover:opacity-100"
          onClick={() => onDelete(item.id)}
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {item.kind === 'text' ? (
        <>
          <button
            type="button"
            className="mt-2 line-clamp-7 min-h-0 flex-1 rounded-xl bg-white/7 px-2.5 py-2 text-left text-sm leading-5 text-white/68 transition hover:bg-white/11 hover:text-white/86"
            onClick={() => onCopy(item.text ?? '')}
            title="Copy text"
          >
            {item.text}
          </button>
          <p className="mt-2 truncate text-[11px] text-white/40">
            {item.source} · {formatTime(item.createdAt)}
          </p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-8 items-center justify-center rounded-xl bg-white/8 px-2 text-xs font-medium text-white/72 transition hover:bg-white/13 hover:text-white"
            onClick={() => onCopy(item.text ?? '')}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            Copy
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="mt-2 block aspect-[4/3] w-full overflow-hidden rounded-xl bg-white/7 text-left"
            onClick={() => onOpenFile(item.id)}
            title="Open in folder"
          >
            {item.isImage ? (
              <img
                src={fileHref(item.id)}
                alt={title}
                className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                loading="lazy"
              />
            ) : (
              <span className="grid h-full place-items-center text-white/34">
                <FileIcon className="h-10 w-10" />
              </span>
            )}
          </button>
          <div className="mt-2 min-w-0">
            <p className="truncate text-sm font-medium text-white/78">{title}</p>
            <p className="mt-0.5 truncate text-[11px] text-white/40">
              {item.source} · {formatTime(item.createdAt)}
              {item.size ? ` · ${formatSize(item.size)}` : ''}
            </p>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              className="inline-flex min-h-8 items-center justify-center rounded-xl bg-white/8 px-2 text-xs font-medium text-white/72 transition hover:bg-white/13 hover:text-white"
              onClick={() => onOpenFile(item.id)}
            >
              <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
              Open
            </button>
            <button
              type="button"
              className="inline-flex min-h-8 items-center justify-center rounded-xl bg-white/8 px-2 text-xs font-medium text-white/72 transition hover:bg-white/13 hover:text-white"
              onClick={() => onCopyFile(item.id)}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ShareQrDialog({ url, pin }: { url: string; pin?: string | null }) {
  const [qrDataUrl, setQrDataUrl] = useState('')

  useEffect(() => {
    let cancelled = false

    QRCode.toDataURL(url, {
      width: 280,
      margin: 1,
      color: {
        dark: '#111827',
        light: '#ffffff',
      },
    }).then((dataUrl) => {
      if (!cancelled) {
        setQrDataUrl(dataUrl)
      }
    })

    return () => {
      cancelled = true
    }
  }, [url])

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/12 hover:text-white"
          title="Show QR code"
        >
          <QrCode className="h-4 w-4" />
        </button>
      </DialogTrigger>
      <DialogContent className="w-[360px]">
        <DialogTitle className="pr-10 text-xl font-semibold">Scan on iPhone</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-white/48">
          用 iOS 相机扫二维码打开手机端 Share 页面。
        </DialogDescription>
        <div className="mt-5 rounded-[26px] bg-white p-4">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt={url} className="mx-auto h-64 w-64" />
          ) : (
            <div className="grid h-64 w-full place-items-center text-slate-500">Generating...</div>
          )}
        </div>
        <div className="mt-4 rounded-2xl bg-white/8 p-3">
          <div className="flex items-center gap-2 text-sm text-white/72">
            <Link2 className="h-4 w-4 shrink-0 text-white/38" />
            <span className="truncate">{url}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-sm text-white/72">
            <span>PIN {pin ?? '------'}</span>
            <Button type="button" size="sm" variant="ghost" onClick={() => void copyText(pin ?? '')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ShareWidget({ config }: { config: DataWidgetConfig }) {
  const [tab, setTab] = useState<'cloud' | 'lan'>('cloud')
  const query = useAgentWidget<LanShareStatusData>(config)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const stunUrls = query.data?.data?.stunUrls

  function sendLanHints() {
    frameRef.current?.contentWindow?.postMessage({ type: 'mypage-lan-stun', urls: stunUrls ?? [] }, 'https://share.reverieach.com')
  }

  useEffect(() => {
    const send = () => frameRef.current?.contentWindow?.postMessage({ type: 'mypage-lan-stun', urls: stunUrls ?? [] }, 'https://share.reverieach.com')
    const ready = (event: MessageEvent) => {
      if (event.source === frameRef.current?.contentWindow && event.origin === 'https://share.reverieach.com' && event.data?.type === 'mypage-share-ready') send()
    }
    send()
    window.addEventListener('message', ready)
    return () => window.removeEventListener('message', ready)
  }, [stunUrls])

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <button type="button" onClick={() => setTab('cloud')} className={cn('rounded-full px-3 py-1.5', tab === 'cloud' ? 'bg-white/20 text-white' : 'text-white/50')}>跨设备</button>
        <button type="button" onClick={() => setTab('lan')} className={cn('rounded-full px-3 py-1.5', tab === 'lan' ? 'bg-white/20 text-white' : 'text-white/50')}>原局域网共享</button>
        <a href="https://share.reverieach.com" target="_blank" rel="noreferrer" className="ml-auto text-white/50 hover:text-white/80">独立页面 ↗</a>
      </div>
      {/* Keep the transport frame mounted when switching tabs so it can still receive. */}
      <iframe
        ref={frameRef}
        onLoad={sendLanHints}
        src="https://share.reverieach.com/?embed=1"
        title="MyPage 跨设备传输"
        allow="clipboard-write"
        referrerPolicy="no-referrer"
        className={cn('min-h-0 w-full flex-1 border-0 bg-transparent', tab !== 'cloud' && 'hidden')}
      />
      {tab === 'lan' && <div className="min-h-0 flex-1"><LanSharePanel config={config} /></div>}
    </div>
  )
}

function LanSharePanel({ config }: { config: DataWidgetConfig }) {
  const query = useAgentWidget<LanShareStatusData>(config)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [isDragging, setIsDragging] = useState(false)
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

  async function uploadFiles(files: FileList | File[] | null) {
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

      setMessage(files.length === 1 ? 'Uploaded' : `${files.length} uploaded`)
      void query.refetch()
    } finally {
      setBusy(false)
      setIsDragging(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      window.setTimeout(() => setMessage(''), 1400)
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

  async function deleteShareItem(id: string) {
    setBusy(true)
    try {
      await postAgentEnvelope(`/api/share/items/${encodeURIComponent(id)}/delete`)
      void query.refetch()
    } finally {
      setBusy(false)
    }
  }

  async function openShareFile(id: string) {
    setBusy(true)
    try {
      const envelope = await postAgentEnvelope(`/api/share/files/${encodeURIComponent(id)}/reveal`)

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      setMessage('Opened')
    } finally {
      setBusy(false)
      window.setTimeout(() => setMessage(''), 1200)
    }
  }

  async function copyShareFile(id: string) {
    setBusy(true)
    try {
      const envelope = await postAgentEnvelope(`/api/share/files/${encodeURIComponent(id)}/copy`)

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      setMessage('Copied')
    } finally {
      setBusy(false)
      window.setTimeout(() => setMessage(''), 1200)
    }
  }

  async function copyShareText(value: string) {
    await copyText(value)
    setMessage('Copied')
    window.setTimeout(() => setMessage(''), 1200)
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    setIsDragging(true)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void uploadFiles(event.dataTransfer.files)
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const imageFiles = clipboardImageFiles(event)

    if (!imageFiles.length) {
      return
    }

    event.preventDefault()
    void uploadFiles(imageFiles)
  }

  if (query.isLoading) {
    return <WidgetLoading label="Checking share" />
  }

  if (query.isError || !query.data) {
    return <WidgetError message="Share needs the local Agent." />
  }

  const data = query.data.data
  const url = data.primaryUrl || data.localUrl
  const recentItems = data.items

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
        <ShareQrDialog url={url} pin={data.pin} />
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

      <div
        className={cn(
          'grid min-h-[82px] place-items-center rounded-2xl border border-dashed border-white/14 bg-white/7 px-3 py-3 text-center transition',
          isDragging ? 'border-emerald-200/70 bg-emerald-200/12 text-white' : 'text-white/54',
        )}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <div>
          <FileUp className="mx-auto mb-1.5 h-5 w-5 text-white/42" />
          <p className="text-sm font-medium">{isDragging ? 'Drop to upload' : 'Drop files here'}</p>
          <button
            type="button"
            className="mt-1 text-xs text-white/44 transition hover:text-white/76"
            onClick={() => fileInputRef.current?.click()}
          >
            or choose files
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onPaste={handlePaste}
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
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          multiple
          onChange={(event) => void uploadFiles(event.currentTarget.files)}
        />
      </div>

      <div className="scrollbar-none grid min-h-0 flex-1 auto-rows-max grid-cols-[repeat(auto-fill,minmax(170px,1fr))] content-start gap-3 overflow-y-auto">
        {recentItems.length ? (
          recentItems.map((item) => (
            <ShareItemCard
              key={item.id}
              item={item}
              onCopy={(value) => void copyShareText(value)}
              onCopyFile={(id) => void copyShareFile(id)}
              onDelete={(id) => void deleteShareItem(id)}
              onOpenFile={(id) => void openShareFile(id)}
            />
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
          {message ? (
            <span className="inline-flex items-center gap-1">
              <Check className="h-3 w-3" />
              {message}
            </span>
          ) : null}
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
