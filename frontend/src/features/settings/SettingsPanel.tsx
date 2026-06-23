import { Eye, EyeOff, Image, LayoutGrid, LinkIcon, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../components/ui/dialog'
import { appConfig } from '../../config/appConfig'
import { useConfigStore } from '../../store/useConfigStore'
import { cn } from '../../utils/cn'

type SettingsTab = 'wallpaper' | 'links' | 'widgets'

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('wallpaper')
  const [wallpaperDraft, setWallpaperDraft] = useState('')
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const links = useConfigStore((state) => state.links)
  const hiddenWidgetIds = useConfigStore((state) => state.hiddenWidgetIds)
  const addLink = useConfigStore((state) => state.addLink)
  const addWallpaper = useConfigStore((state) => state.addWallpaper)
  const hideWidget = useConfigStore((state) => state.hideWidget)
  const removeLink = useConfigStore((state) => state.removeLink)
  const removeWallpaper = useConfigStore((state) => state.removeWallpaper)
  const resetLinks = useConfigStore((state) => state.resetLinks)
  const resetWallpapers = useConfigStore((state) => state.resetWallpapers)
  const setWallpaper = useConfigStore((state) => state.setWallpaper)
  const showWidget = useConfigStore((state) => state.showWidget)
  const updateLink = useConfigStore((state) => state.updateLink)

  function handleWallpaperFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        addWallpaper({
          label: file.name.replace(/\.[^.]+$/, '') || 'Wallpaper',
          src: reader.result,
        })
      }
    })
    reader.readAsDataURL(file)
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
          { id: 'widgets', label: 'Widgets', icon: LayoutGrid },
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
              {wallpapers.map((item) => (
                <div
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-white/12 bg-white/10"
                >
                  <button
                    type="button"
                    className="block w-full text-left transition hover:opacity-90"
                    onClick={() => setWallpaper(item.src)}
                  >
                    <img
                      src={item.src}
                      alt=""
                      className="aspect-video w-full object-cover"
                      draggable={false}
                    />
                    <span className="block truncate px-3 py-2 text-xs font-medium text-white/72">
                      {item.label}
                    </span>
                  </button>
                  <div className="flex items-center justify-between border-t border-white/10 px-2 py-1">
                    <span className="text-[11px] text-white/38">
                      {item.src === wallpaper ? 'Active' : 'Saved'}
                    </span>
                    <button
                      type="button"
                      className="rounded-full p-1 text-white/42 transition hover:bg-white/10 hover:text-white"
                      onClick={() => removeWallpaper(item.id)}
                      aria-label={`Remove ${item.label}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
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
                      addWallpaper({
                        label: 'Custom',
                        src: wallpaperDraft.trim(),
                      })
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

            <Button variant="ghost" onClick={resetWallpapers}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset wallpapers
            </Button>
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
                <Button size="sm" onClick={() => addLink()}>
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

        {activeTab === 'widgets' ? (
          <div className="space-y-3">
            {appConfig.widgets.map((widget) => {
              const hidden = hiddenWidgetIds.includes(widget.id)

              return (
                <div
                  key={widget.id}
                  className="flex items-center justify-between gap-3 rounded-3xl border border-white/12 bg-white/10 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white/82">
                      {widget.title}
                    </p>
                    <p className="mt-1 truncate text-xs text-white/44">
                      {hidden ? 'Hidden from home' : 'Visible on home'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={hidden ? 'glass' : 'ghost'}
                    onClick={() =>
                      hidden ? showWidget(widget.id) : hideWidget(widget.id)
                    }
                  >
                    {hidden ? (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    )}
                    {hidden ? 'Show' : 'Hide'}
                  </Button>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </DialogContent>
  )
}
