import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { appConfig } from '../config/appConfig'
import type { AppConfig, QuickLink } from '../config/types'

const linksWidget = appConfig.widgets.find((widget) => widget.type === 'links.grid')
const defaultLinks = linksWidget?.type === 'links.grid' ? linksWidget.links : []

export type UserConfigSnapshot = {
  wallpaper: string
  wallpapers: SavedWallpaper[]
  links: QuickLink[]
  hiddenWidgetIds: string[]
  note: string
  searchEngineId: string
  updatedAt: string | null
}

export type SavedWallpaper = {
  id: string
  label: string
  src: string
}

type ConfigState = UserConfigSnapshot & {
  addLink: (link?: Partial<QuickLink>) => void
  addWallpaper: (wallpaper: Omit<SavedWallpaper, 'id'>) => void
  hideWidget: (id: string) => void
  importSnapshot: (snapshot: Partial<UserConfigSnapshot>) => void
  moveLink: (id: string, direction: -1 | 1) => void
  moveLinkToIndex: (id: string, targetIndex: number) => void
  removeWallpaper: (id: string) => void
  removeLink: (id: string) => void
  resetAll: () => void
  resetLinks: () => void
  resetWallpapers: () => void
  setNote: (note: string) => void
  showWidget: (id: string) => void
  setLinks: (links: QuickLink[]) => void
  setSearchEngineId: (id: string) => void
  setWallpaper: (wallpaper: string) => void
  updateLink: (id: string, patch: Partial<QuickLink>) => void
}

function nowStamp() {
  return new Date().toISOString()
}

function createLinkId() {
  return `link-${Date.now().toString(36)}`
}

function createWallpaperId() {
  return `wallpaper-${Date.now().toString(36)}`
}

export const defaultWallpapers: SavedWallpaper[] = [
  {
    id: 'default-lake',
    label: 'Lake',
    src: appConfig.wallpaper,
  },
]

export const defaultUserConfig: UserConfigSnapshot = {
  wallpaper: appConfig.wallpaper,
  wallpapers: defaultWallpapers,
  links: defaultLinks,
  hiddenWidgetIds: ['sticky-note', 'weather', 'important-info'],
  note: '',
  searchEngineId: 'bing',
  updatedAt: null,
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...defaultUserConfig,
      addLink: (link) =>
        set((state) => ({
          links: [
            {
              id: createLinkId(),
              label: link?.label ?? 'New Link',
              href: link?.href ?? 'https://example.com',
              category: link?.category ?? 'Tools',
              icon: link?.icon,
            },
            ...state.links,
          ],
          updatedAt: nowStamp(),
        })),
      addWallpaper: (wallpaper) =>
        set((state) => {
          const existing = state.wallpapers.find(
            (item) => item.src === wallpaper.src,
          )

          if (existing) {
            return {
              wallpaper: existing.src,
              updatedAt: nowStamp(),
            }
          }

          const nextWallpaper = {
            id: createWallpaperId(),
            ...wallpaper,
          }

          return {
            wallpaper: nextWallpaper.src,
            wallpapers: [...state.wallpapers, nextWallpaper],
            updatedAt: nowStamp(),
          }
        }),
      hideWidget: (id) =>
        set((state) => ({
          hiddenWidgetIds: state.hiddenWidgetIds.includes(id)
            ? state.hiddenWidgetIds
            : [...state.hiddenWidgetIds, id],
          updatedAt: nowStamp(),
        })),
      importSnapshot: (snapshot) =>
        set((state) => ({
          wallpaper:
            typeof snapshot.wallpaper === 'string'
              ? snapshot.wallpaper
              : state.wallpaper,
          wallpapers: Array.isArray(snapshot.wallpapers)
            ? snapshot.wallpapers
            : state.wallpapers,
          links: Array.isArray(snapshot.links) ? snapshot.links : state.links,
          hiddenWidgetIds: Array.isArray(snapshot.hiddenWidgetIds)
            ? snapshot.hiddenWidgetIds
            : state.hiddenWidgetIds,
          note: typeof snapshot.note === 'string' ? snapshot.note : state.note,
          searchEngineId:
            typeof snapshot.searchEngineId === 'string'
              ? snapshot.searchEngineId
              : state.searchEngineId,
          updatedAt:
            typeof snapshot.updatedAt === 'string'
              ? snapshot.updatedAt
              : state.updatedAt,
        })),
      moveLink: (id, direction) =>
        set((state) => {
          const index = state.links.findIndex((link) => link.id === id)
          const targetIndex = index + direction

          if (index < 0 || targetIndex < 0 || targetIndex >= state.links.length) {
            return state
          }

          const links = [...state.links]
          const [link] = links.splice(index, 1)
          links.splice(targetIndex, 0, link)

          return { links, updatedAt: nowStamp() }
        }),
      moveLinkToIndex: (id, targetIndex) =>
        set((state) => {
          const index = state.links.findIndex((link) => link.id === id)

          if (index < 0 || targetIndex < 0 || targetIndex >= state.links.length) {
            return state
          }

          const links = [...state.links]
          const [link] = links.splice(index, 1)
          links.splice(targetIndex, 0, link)

          return { links, updatedAt: nowStamp() }
        }),
      removeLink: (id) =>
        set((state) => ({
          links: state.links.filter((link) => link.id !== id),
          updatedAt: nowStamp(),
        })),
      removeWallpaper: (id) =>
        set((state) => {
          const wallpapers = state.wallpapers.filter((item) => item.id !== id)
          const stillSelected = wallpapers.some((item) => item.src === state.wallpaper)

          return {
            wallpapers,
            wallpaper: stillSelected
              ? state.wallpaper
              : (wallpapers[0]?.src ?? appConfig.wallpaper),
            updatedAt: nowStamp(),
          }
        }),
      resetAll: () => set({ ...defaultUserConfig, updatedAt: nowStamp() }),
      resetLinks: () => set({ links: defaultLinks, updatedAt: nowStamp() }),
      resetWallpapers: () =>
        set({
          wallpaper: appConfig.wallpaper,
          wallpapers: defaultWallpapers,
          updatedAt: nowStamp(),
        }),
      setNote: (note) => set({ note, updatedAt: nowStamp() }),
      showWidget: (id) =>
        set((state) => ({
          hiddenWidgetIds: state.hiddenWidgetIds.filter((widgetId) => widgetId !== id),
          updatedAt: nowStamp(),
        })),
      setLinks: (links) => set({ links, updatedAt: nowStamp() }),
      setSearchEngineId: (id) =>
        set({ searchEngineId: id, updatedAt: nowStamp() }),
      setWallpaper: (wallpaper) => set({ wallpaper, updatedAt: nowStamp() }),
      updateLink: (id, patch) =>
        set((state) => ({
          links: state.links.map((link) =>
            link.id === id ? { ...link, ...patch } : link,
          ),
          updatedAt: nowStamp(),
        })),
    }),
    {
      name: 'mypage-user-config-v2',
      partialize: (state) => ({
        wallpaper: state.wallpaper,
        wallpapers: state.wallpapers,
        links: state.links,
        hiddenWidgetIds: state.hiddenWidgetIds,
        note: state.note,
        searchEngineId: state.searchEngineId,
        updatedAt: state.updatedAt,
      }),
    },
  ),
)

export function createEffectiveConfig(snapshot: UserConfigSnapshot): AppConfig {
  return {
    ...appConfig,
    wallpaper: snapshot.wallpaper || appConfig.wallpaper,
    widgets: appConfig.widgets
      .filter((widget) => !snapshot.hiddenWidgetIds.includes(widget.id))
      .map((widget) =>
        widget.type === 'links.grid'
          ? {
              ...widget,
              links: snapshot.links,
            }
          : widget,
      ),
  }
}
