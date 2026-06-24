import { useEffect, useRef } from 'react'

import {
  configUpdatedAt,
  loadAgentConfig,
  saveAgentConfig,
  type BackedUpConfig,
} from '../../data/configBackup'
import { appConfig } from '../../config/appConfig'
import {
  defaultUserConfig,
  useConfigStore,
  type SavedWallpaper,
  type UserConfigSnapshot,
} from '../../store/useConfigStore'
import { useLayoutStore } from '../../store/useLayoutStore'

const legacyNoteKey = 'mypage-sticky-note'
const saveDelayMs = 900

function maxTimestamp(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
}

function isDefaultWallpaper(src: string | null | undefined) {
  return !src || src === appConfig.wallpaper || src.endsWith('/wallpapers/default.png')
}

function mergeWallpapers(local: SavedWallpaper[], remote: SavedWallpaper[]) {
  const bySrc = new Map<string, SavedWallpaper>()

  for (const wallpaper of [...local, ...remote]) {
    if (!wallpaper.src) {
      continue
    }

    bySrc.set(wallpaper.src, {
      ...bySrc.get(wallpaper.src),
      ...wallpaper,
    })
  }

  return Array.from(bySrc.values())
}

function nonDefaultWallpaperCount(snapshot: UserConfigSnapshot) {
  return snapshot.wallpapers.filter((wallpaper) => !isDefaultWallpaper(wallpaper.src)).length
}

function hasRicherRemoteUserConfig(remote: UserConfigSnapshot, local: UserConfigSnapshot) {
  if (isDefaultWallpaper(local.wallpaper) && !isDefaultWallpaper(remote.wallpaper)) {
    return true
  }

  if (nonDefaultWallpaperCount(remote) > nonDefaultWallpaperCount(local)) {
    return true
  }

  const localLooksDefaultLinks = local.links.length <= defaultUserConfig.links.length

  if (localLooksDefaultLinks && remote.links.length > local.links.length) {
    return true
  }

  return !local.note && Boolean(remote.note)
}

function mergeProtectiveBackup(local: BackedUpConfig, remote: BackedUpConfig): BackedUpConfig {
  const localUser = local.userConfig
  const remoteUser = remote.userConfig
  const mergedWallpapers = mergeWallpapers(localUser.wallpapers, remoteUser.wallpapers)
  const localLooksDefaultLinks = localUser.links.length <= defaultUserConfig.links.length
  const useRemoteLinks = localLooksDefaultLinks && remoteUser.links.length > localUser.links.length
  const useRemoteWallpaper =
    isDefaultWallpaper(localUser.wallpaper) && !isDefaultWallpaper(remoteUser.wallpaper)
  const remoteLayoutsUpdatedAt = remote.layoutsUpdatedAt
  const localLayoutsUpdatedAt = local.layoutsUpdatedAt
  const useRemoteLayouts =
    Boolean(remoteLayoutsUpdatedAt) &&
    (!localLayoutsUpdatedAt || remoteLayoutsUpdatedAt! > localLayoutsUpdatedAt)

  return {
    userConfig: {
      ...localUser,
      wallpaper: useRemoteWallpaper ? remoteUser.wallpaper : localUser.wallpaper,
      wallpapers: mergedWallpapers,
      randomWallpaperEnabled:
        localUser.randomWallpaperEnabled || remoteUser.randomWallpaperEnabled,
      links: useRemoteLinks ? remoteUser.links : localUser.links,
      hiddenWidgetIds: localUser.hiddenWidgetIds.length
        ? localUser.hiddenWidgetIds
        : remoteUser.hiddenWidgetIds,
      note: localUser.note || remoteUser.note,
      searchEngineId:
        localUser.searchEngineId === defaultUserConfig.searchEngineId
          ? remoteUser.searchEngineId
          : localUser.searchEngineId,
      updatedAt: maxTimestamp(localUser.updatedAt, remoteUser.updatedAt, new Date().toISOString()),
    },
    layouts: useRemoteLayouts ? remote.layouts : local.layouts,
    layoutsUpdatedAt: useRemoteLayouts ? remote.layoutsUpdatedAt : local.layoutsUpdatedAt,
  }
}

function currentUserConfig(): UserConfigSnapshot {
  const state = useConfigStore.getState()

  return {
    wallpaper: state.wallpaper,
    wallpapers: state.wallpapers,
    randomWallpaperEnabled: state.randomWallpaperEnabled,
    links: state.links,
    hiddenWidgetIds: state.hiddenWidgetIds,
    note: state.note,
    searchEngineId: state.searchEngineId,
    updatedAt: state.updatedAt,
  }
}

function currentBackupConfig(): BackedUpConfig {
  const layoutState = useLayoutStore.getState()

  return {
    userConfig: currentUserConfig(),
    layouts: layoutState.layouts,
    layoutsUpdatedAt: layoutState.updatedAt,
  }
}

function applyBackupConfig(config: BackedUpConfig) {
  const visibleWidgetIds = appConfig.widgets
    .map((widget) => widget.id)
    .filter(
      (widgetId) => !config.userConfig.hiddenWidgetIds.includes(widgetId),
    )

  useConfigStore.getState().importSnapshot(config.userConfig)
  useLayoutStore.getState().importLayouts(
    config.layouts,
    config.layoutsUpdatedAt,
    visibleWidgetIds,
  )
}

export function ConfigBackupSync() {
  const bootstrappedRef = useRef(false)
  const restoringRef = useRef(false)
  const saveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const legacyNote = localStorage.getItem(legacyNoteKey)

    if (legacyNote && !useConfigStore.getState().note) {
      useConfigStore.getState().setNote(legacyNote)
      localStorage.removeItem(legacyNoteKey)
    }

    async function bootstrap() {
      const localConfig = currentBackupConfig()
      const localUpdatedAt = maxTimestamp(
        localConfig.userConfig.updatedAt,
        localConfig.layoutsUpdatedAt,
      )

      try {
        const envelope = await loadAgentConfig()
        const remote = envelope.data.config
        const remoteUpdatedAt = remote
          ? envelope.data.updatedAt ?? configUpdatedAt(remote)
          : null

        if (remote && (!localUpdatedAt || (remoteUpdatedAt && remoteUpdatedAt > localUpdatedAt))) {
          restoringRef.current = true
          applyBackupConfig(remote)
          window.setTimeout(() => {
            restoringRef.current = false
          }, 0)
        } else if (remote && hasRicherRemoteUserConfig(remote.userConfig, localConfig.userConfig)) {
          const mergedConfig = mergeProtectiveBackup(localConfig, remote)

          restoringRef.current = true
          applyBackupConfig(mergedConfig)
          await saveAgentConfig(mergedConfig, 'bootstrap-protective-merge')
          window.setTimeout(() => {
            restoringRef.current = false
          }, 0)
        } else if (localUpdatedAt && (!remoteUpdatedAt || localUpdatedAt > remoteUpdatedAt)) {
          await saveAgentConfig(localConfig, 'bootstrap-local-newer')
        } else if (!remote && localUpdatedAt) {
          await saveAgentConfig(localConfig, 'initial-local-cache')
        }
      } catch {
        // Agent backup is optional at runtime. The local cache remains usable.
      } finally {
        bootstrappedRef.current = true
      }
    }

    void bootstrap()

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    function scheduleSave() {
      if (!bootstrappedRef.current || restoringRef.current) {
        return
      }

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }

      saveTimerRef.current = window.setTimeout(() => {
        void saveAgentConfig(currentBackupConfig()).catch(() => {
          // Keep localStorage as the fallback cache when the Agent is offline.
        })
      }, saveDelayMs)
    }

    const unsubscribeConfig = useConfigStore.subscribe(scheduleSave)
    const unsubscribeLayouts = useLayoutStore.subscribe(scheduleSave)

    return () => {
      unsubscribeConfig()
      unsubscribeLayouts()

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  return null
}
