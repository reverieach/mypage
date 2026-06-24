import {
  Database,
  Download,
  Eye,
  EyeOff,
  Image,
  LayoutGrid,
  LinkIcon,
  Moon,
  Plus,
  RotateCcw,
  Shuffle,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import { useState } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '../../components/ui/button'
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../components/ui/dialog'
import { appConfig } from '../../config/appConfig'
import {
  loadAgentConfig,
  listAgentConfigSnapshots,
  restoreAgentConfigSnapshot,
  saveAgentConfig,
  type AgentConfigData,
  type BackedUpConfig,
} from '../../data/configBackup'
import { deriveWallpaperPreview, uploadWallpaper } from '../../data/wallpapers'
import { useConfigStore } from '../../store/useConfigStore'
import type { SavedWallpaper, WallpaperGroup } from '../../store/useConfigStore'
import { useLayoutStore } from '../../store/useLayoutStore'
import { cn } from '../../utils/cn'

type SettingsTab = 'wallpaper' | 'links' | 'widgets' | 'backup'

const wallpaperGroups: Array<{
  id: WallpaperGroup
  label: string
  icon: typeof Sparkles
}> = [
  { id: 'general', label: 'All', icon: Sparkles },
  { id: 'day', label: 'Day', icon: Sun },
  { id: 'night', label: 'Night', icon: Moon },
]

function inferWallpaperKind(src: string): SavedWallpaper['kind'] {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(src) ? 'video' : 'image'
}

function WallpaperPreview({
  className,
  wallpaper,
}: {
  className: string
  wallpaper: SavedWallpaper
}) {
  if (wallpaper.kind === 'video') {
    const preview = wallpaper.preview ?? deriveWallpaperPreview(wallpaper.src)

    if (preview) {
      return (
        <img
          src={preview}
          alt=""
          className={className}
          draggable={false}
          loading="lazy"
        />
      )
    }

    return (
      <video
        src={wallpaper.src}
        className={className}
        autoPlay
        muted
        loop
        playsInline
      />
    )
  }

  return (
    <img
      src={wallpaper.src}
      alt=""
      className={className}
      draggable={false}
    />
  )
}

export function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('wallpaper')
  const [wallpaperDraft, setWallpaperDraft] = useState('')
  const [wallpaperError, setWallpaperError] = useState<string | null>(null)
  const [backupStatus, setBackupStatus] = useState<AgentConfigData | null>(null)
  const [backupError, setBackupError] = useState<string | null>(null)
  const wallpaper = useConfigStore((state) => state.wallpaper)
  const wallpapers = useConfigStore((state) => state.wallpapers)
  const randomWallpaperEnabled = useConfigStore(
    (state) => state.randomWallpaperEnabled,
  )
  const links = useConfigStore((state) => state.links)
  const hiddenWidgetIds = useConfigStore((state) => state.hiddenWidgetIds)
  const note = useConfigStore((state) => state.note)
  const searchEngineId = useConfigStore((state) => state.searchEngineId)
  const configUpdatedAt = useConfigStore((state) => state.updatedAt)
  const addLink = useConfigStore((state) => state.addLink)
  const addWallpaper = useConfigStore((state) => state.addWallpaper)
  const hideWidget = useConfigStore((state) => state.hideWidget)
  const importSnapshot = useConfigStore((state) => state.importSnapshot)
  const removeLink = useConfigStore((state) => state.removeLink)
  const removeWallpaper = useConfigStore((state) => state.removeWallpaper)
  const resetLinks = useConfigStore((state) => state.resetLinks)
  const resetWallpapers = useConfigStore((state) => state.resetWallpapers)
  const setRandomWallpaperEnabled = useConfigStore(
    (state) => state.setRandomWallpaperEnabled,
  )
  const setWallpaper = useConfigStore((state) => state.setWallpaper)
  const showWidget = useConfigStore((state) => state.showWidget)
  const updateLink = useConfigStore((state) => state.updateLink)
  const updateWallpaper = useConfigStore((state) => state.updateWallpaper)
  const appendWidgetLayout = useLayoutStore((state) => state.appendWidgetLayout)
  const compactWidgetLayouts = useLayoutStore((state) => state.compactLayouts)
  const layouts = useLayoutStore((state) => state.layouts)
  const layoutsUpdatedAt = useLayoutStore((state) => state.updatedAt)
  const importLayouts = useLayoutStore((state) => state.importLayouts)

  function currentBackupConfig(): BackedUpConfig {
    return {
      userConfig: {
        wallpaper,
        wallpapers,
        randomWallpaperEnabled,
        links,
        hiddenWidgetIds,
        note,
        searchEngineId,
        updatedAt: configUpdatedAt,
      },
      layouts,
      layoutsUpdatedAt,
    }
  }

  async function refreshBackupStatus() {
    try {
      const envelope = await loadAgentConfig()
      setBackupStatus(envelope.data)
      setBackupError(envelope.error)
    } catch {
      setBackupError('Agent backup is unavailable')
    }
  }

  function visibleWidgetIdsAfterHide(id: string) {
    return appConfig.widgets
      .map((widget) => widget.id)
      .filter(
        (widgetId) =>
          widgetId !== id && !hiddenWidgetIds.includes(widgetId),
      )
  }

  function handleShowWidget(id: string) {
    const visibleWidgetIds = appConfig.widgets
      .map((widget) => widget.id)
      .filter((widgetId) => !hiddenWidgetIds.includes(widgetId))

    appendWidgetLayout(id, visibleWidgetIds)
    showWidget(id)
  }

  function handleHideWidget(id: string) {
    hideWidget(id)
    compactWidgetLayouts(visibleWidgetIdsAfterHide(id))
  }

  function visibleWidgetIdsForSnapshot(config: BackedUpConfig) {
    return appConfig.widgets
      .map((widget) => widget.id)
      .filter(
        (widgetId) =>
          !config.userConfig.hiddenWidgetIds.includes(widgetId),
      )
  }

  function applyBackupConfig(config: BackedUpConfig) {
    importSnapshot(config.userConfig)
    importLayouts(
      config.layouts,
      config.layoutsUpdatedAt,
      visibleWidgetIdsForSnapshot(config),
    )
  }

  async function exportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      config: currentBackupConfig(),
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `mypage-backup-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    try {
      const parsed = JSON.parse(await file.text()) as {
        config?: BackedUpConfig
      }
      if (!parsed.config?.userConfig || !parsed.config.layouts) {
        throw new Error('Invalid backup file')
      }

      applyBackupConfig(parsed.config)
      const envelope = await saveAgentConfig(parsed.config, 'import')
      setBackupStatus(envelope.data)
      setBackupError(envelope.error)
    } catch (error) {
      setBackupError(error instanceof Error ? error.message : 'Import failed')
    }
  }

  async function restoreLatestSnapshot() {
    try {
      const status = await loadAgentConfig()
      const snapshotCount = status.data.snapshotCount

      if (!snapshotCount) {
        setBackupError('No snapshots to restore')
        return
      }

      const snapshots = await listAgentConfigSnapshots()
      const latestId = snapshots.data.items[0]?.id

      if (!latestId) {
        setBackupError('No snapshots to restore')
        return
      }

      const envelope = await restoreAgentConfigSnapshot(latestId)
      if (envelope.data.config) {
        applyBackupConfig(envelope.data.config)
      }
      setBackupStatus(envelope.data)
      setBackupError(envelope.error)
    } catch {
      setBackupError('Restore failed')
    }
  }

  const activeWallpaper = wallpapers.find((item) => item.src === wallpaper) ?? {
    id: 'active-wallpaper',
    label: 'Wallpaper',
    kind: inferWallpaperKind(wallpaper),
    src: wallpaper,
  }

  async function handleWallpaperFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    setWallpaperError(null)

    try {
      const envelope = await uploadWallpaper(file)

      if (envelope.error) {
        throw new Error(envelope.error)
      }

      addWallpaper({
        label: envelope.data.label,
        src: envelope.data.src,
        kind: envelope.data.kind,
        preview: envelope.data.preview,
        fallback: envelope.data.fallback,
      })
      return
    } catch (error) {
      if (file.type.startsWith('video/')) {
        setWallpaperError(
          error instanceof Error ? error.message : 'Video upload failed',
        )
        return
      }
    }

    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') {
        addWallpaper({
          label: file.name.replace(/\.[^.]+$/, '') || 'Wallpaper',
          src: reader.result,
          kind: 'image',
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

      <div className="mt-5 grid grid-cols-4 gap-2 rounded-full border border-white/12 bg-white/10 p-1">
        {[
          { id: 'wallpaper', label: 'Wallpaper', icon: Image },
          { id: 'links', label: 'Links', icon: LinkIcon },
          { id: 'widgets', label: 'Widgets', icon: LayoutGrid },
          { id: 'backup', label: 'Backup', icon: Database },
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
              onClick={() => {
                setActiveTab(tab.id as SettingsTab)

                if (tab.id === 'backup') {
                  void refreshBackupStatus()
                }
              }}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="scrollbar-none mt-5 min-h-0 flex-1 overflow-y-auto">
        {activeTab === 'wallpaper' ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-3xl border border-white/12 bg-white/10">
              <WallpaperPreview
                wallpaper={activeWallpaper}
                className="aspect-video w-full object-cover"
              />
            </div>

            <div className="rounded-3xl border border-white/12 bg-white/10 p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-white/82">
                    <Shuffle className="h-4 w-4" aria-hidden="true" />
                    Random wallpaper
                  </p>
                  <p className="mt-1 text-xs text-white/46">
                    Uses Day + All from 06:00 to 18:00, Night + All otherwise.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={randomWallpaperEnabled}
                  className={cn(
                    'relative h-7 w-12 shrink-0 rounded-full border transition',
                    randomWallpaperEnabled
                      ? 'border-white/30 bg-white/32'
                      : 'border-white/12 bg-white/10',
                  )}
                  onClick={() =>
                    setRandomWallpaperEnabled(!randomWallpaperEnabled)
                  }
                >
                  <span
                    className={cn(
                      'absolute top-1 h-5 w-5 rounded-full bg-white shadow-soft transition-transform',
                      randomWallpaperEnabled
                        ? 'translate-x-5'
                        : 'translate-x-1',
                    )}
                  />
                </button>
              </div>
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
                    <WallpaperPreview
                      wallpaper={item}
                      className="aspect-video w-full object-cover"
                    />
                    <span className="block truncate px-3 py-2 text-xs font-medium text-white/72">
                      {item.label}
                    </span>
                  </button>
                  <div className="flex items-center justify-between border-t border-white/10 px-2 py-1">
                    <span className="text-[11px] text-white/38">
                      {item.src === wallpaper ? 'Fixed' : 'Saved'}
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
                  <div className="grid grid-cols-3 gap-1 border-t border-white/10 p-1">
                    {wallpaperGroups.map((group) => {
                      const Icon = group.icon
                      const activeGroup = (item.group ?? 'general') === group.id

                      return (
                        <button
                          key={group.id}
                          type="button"
                          className={cn(
                            'flex h-8 items-center justify-center gap-1 rounded-full text-[11px] font-medium text-white/46 transition',
                            activeGroup && 'bg-white/18 text-white/82',
                          )}
                          onClick={() =>
                            updateWallpaper(item.id, { group: group.id })
                          }
                        >
                          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                          {group.label}
                        </button>
                      )
                    })}
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
                        kind: inferWallpaperKind(wallpaperDraft.trim()),
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
              Choose image or video
              <input
                type="file"
                accept="image/*,video/mp4,video/webm,video/quicktime"
                className="hidden"
                onChange={(event) => void handleWallpaperFile(event)}
              />
            </label>
            {wallpaperError ? (
              <p className="text-xs text-rose-100/80">{wallpaperError}</p>
            ) : null}

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
                      hidden
                        ? handleShowWidget(widget.id)
                        : handleHideWidget(widget.id)
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

        {activeTab === 'backup' ? (
          <div className="space-y-4">
            <div className="rounded-3xl border border-white/12 bg-white/10 p-4">
              <p className="text-sm font-medium text-white/82">
                Agent backup
              </p>
              <div className="mt-3 space-y-2 text-xs text-white/52">
                <p>
                  Status:{' '}
                  {backupStatus?.configured ? 'Configured' : 'No backup yet'}
                </p>
                <p>
                  Last save:{' '}
                  {backupStatus?.updatedAt
                    ? new Date(backupStatus.updatedAt).toLocaleString('zh-CN')
                    : 'Never'}
                </p>
                <p>Snapshots: {backupStatus?.snapshotCount ?? 0}</p>
                <p>Source: Agent SQLite + browser localStorage cache</p>
                {backupError ? (
                  <p className="text-amber-100/82">{backupError}</p>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={() => void refreshBackupStatus()}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Refresh
              </Button>
              <Button variant="ghost" onClick={() => void restoreLatestSnapshot()}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Restore latest
              </Button>
              <Button variant="ghost" onClick={() => void exportBackup()}>
                <Download className="h-4 w-4" aria-hidden="true" />
                Export
              </Button>
              <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 text-sm font-medium text-white/72 transition hover:bg-white/16">
                <Upload className="h-4 w-4" aria-hidden="true" />
                Import
                <input
                  type="file"
                  accept="application/json"
                  className="hidden"
                  onChange={handleBackupFile}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>
    </DialogContent>
  )
}
