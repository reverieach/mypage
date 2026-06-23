import {
  Download,
  Image,
  LinkIcon,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  type UserConfigSnapshot,
  useConfigStore,
} from '../../store/useConfigStore'
import { cn } from '../../utils/cn'

type SettingsTab = 'wallpaper' | 'links' | 'config'

const wallpaperPresets = [
  {
    label: 'Lake',
    value: '/wallpapers/default.png',
  },
]

function safeParseConfig(value: string): Partial<UserConfigSnapshot> | null {
  try {
    const parsed = JSON.parse(value) as Partial<UserConfigSnapshot>

    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('wallpaper')
  const [importValue, setImportValue] = useState('')
  const [wallpaperDraft, setWallpaperDraft] = useState('')
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const links = useConfigStore((state) => state.links)
  const addLink = useConfigStore((state) => state.addLink)
  const importSnapshot = useConfigStore((state) => state.importSnapshot)
  const removeLink = useConfigStore((state) => state.removeLink)
  const resetAll = useConfigStore((state) => state.resetAll)
  const resetLinks = useConfigStore((state) => state.resetLinks)
  const setWallpaper = useConfigStore((state) => state.setWallpaper)
  const updateLink = useConfigStore((state) => state.updateLink)
  const exportedConfig = useMemo(
    () =>
      JSON.stringify(
        {
          wallpaper,
          links,
        } satisfies UserConfigSnapshot,
        null,
        2,
      ),
    [links, wallpaper],
  )

  function handleWallpaperFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        setWallpaper(reader.result)
      }
    })
    reader.readAsDataURL(file)
  }

  function handleImport() {
    const parsed = safeParseConfig(importValue)

    if (parsed) {
      importSnapshot(parsed)
      setImportValue('')
    }
  }

  return (
    <DialogContent>
      <div className="pr-12">
        <DialogTitle className="text-xl font-semibold">Settings</DialogTitle>
        <DialogDescription className="mt-1 text-sm text-white/54">
          Personal start page controls
        </DialogDescription>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 rounded-full border border-white/12 bg-white/10 p-1">
        {[
          { id: 'wallpaper', label: 'Wallpaper', icon: Image },
          { id: 'links', label: 'Links', icon: LinkIcon },
          { id: 'config', label: 'Config', icon: Upload },
        ].map((tab) => {
          const Icon = tab.icon

          return (
            <button
              key={tab.id}
              type="button"
              className={cn(
                'flex h-9 items-center justify-center gap-2 rounded-full text-xs font-medium text-white/62 transition',
                activeTab === tab.id && 'bg-white/20 text-white shadow-soft',
              )}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
        {activeTab === 'wallpaper' ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-white/12 bg-white/10">
              <img
                src={wallpaper}
                alt=""
                className="aspect-video w-full object-cover"
                draggable={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {wallpaperPresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  className="overflow-hidden rounded-2xl border border-white/12 bg-white/10 text-left transition hover:bg-white/16"
                  onClick={() => setWallpaper(preset.value)}
                >
                  <img
                    src={preset.value}
                    alt=""
                    className="aspect-video w-full object-cover"
                    draggable={false}
                  />
                  <span className="block px-3 py-2 text-xs font-medium text-white/72">
                    {preset.label}
                  </span>
                </button>
              ))}
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-medium text-white/62">
                Image URL or public path
              </span>
              <div className="flex gap-2">
                <input
                  value={wallpaperDraft}
                  onChange={(event) => setWallpaperDraft(event.target.value)}
                  placeholder="/wallpapers/default.png"
                  className="h-10 min-w-0 flex-1 rounded-full border border-white/12 bg-white/10 px-4 text-sm text-white placeholder:text-white/36 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
                <Button
                  size="sm"
                  onClick={() => {
                    if (wallpaperDraft.trim()) {
                      setWallpaper(wallpaperDraft.trim())
                      setWallpaperDraft('')
                    }
                  }}
                >
                  Apply
                </Button>
              </div>
            </label>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-white/14 bg-white/10 px-4 py-3 text-sm font-medium text-white/74 transition hover:bg-white/16">
              <Image className="h-4 w-4" aria-hidden="true" />
              Choose image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleWallpaperFile}
              />
            </label>
          </div>
        ) : null}

        {activeTab === 'links' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-white/72">
                {links.length} shortcuts
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={resetLinks}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset
                </Button>
                <Button size="sm" onClick={addLink}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add
                </Button>
              </div>
            </div>

            {links.map((link) => (
              <div
                key={link.id}
                className="rounded-3xl border border-white/12 bg-white/10 p-3"
              >
                <div className="flex items-center gap-2">
                  <input
                    value={link.label}
                    onChange={(event) =>
                      updateLink(link.id, { label: event.target.value })
                    }
                    className="h-10 min-w-0 flex-1 rounded-full border border-white/12 bg-white/10 px-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <Button
                    aria-label={`Remove ${link.label}`}
                    size="icon"
                    variant="ghost"
                    onClick={() => removeLink(link.id)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
                <input
                  value={link.href}
                  onChange={(event) =>
                    updateLink(link.id, { href: event.target.value })
                  }
                  className="mt-2 h-10 w-full rounded-full border border-white/12 bg-white/10 px-4 text-sm text-white/76 focus:outline-none focus:ring-2 focus:ring-white/30"
                />
              </div>
            ))}
          </div>
        ) : null}

        {activeTab === 'config' ? (
          <div className="space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white/62">Export</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigator.clipboard.writeText(exportedConfig)}
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Copy
                </Button>
              </div>
              <textarea
                readOnly
                value={exportedConfig}
                className="h-40 w-full resize-none rounded-3xl border border-white/12 bg-white/10 p-4 font-mono text-xs leading-5 text-white/70 focus:outline-none"
              />
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium text-white/62">
                Import
              </span>
              <textarea
                value={importValue}
                onChange={(event) => setImportValue(event.target.value)}
                className="h-32 w-full resize-none rounded-3xl border border-white/12 bg-white/10 p-4 font-mono text-xs leading-5 text-white/70 focus:outline-none focus:ring-2 focus:ring-white/30"
              />
              <div className="mt-3 flex justify-between gap-2">
                <Button variant="ghost" onClick={() => setImportValue('')}>
                  Clear
                </Button>
                <Button onClick={handleImport}>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Import
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-white/12 bg-white/8 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-white/78">
                    Reset personal config
                  </p>
                  <p className="mt-1 text-xs text-white/46">
                    Restore the built-in wallpaper and links.
                  </p>
                </div>
                <Button variant="ghost" onClick={resetAll}>
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  Reset
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DialogContent>
  )
}
