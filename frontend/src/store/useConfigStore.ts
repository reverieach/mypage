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
}

export type SavedWallpaper = {
  id: string
  label: string
  src: string
}

type ConfigState = UserConfigSnapshot & {
  addLink: (link?: Partial<QuickLink>) => void
  addWallpaper: (wallpaper: Omit<SavedWallpaper, 'id'>) => void
  importSnapshot: (snapshot: Partial<UserConfigSnapshot>) => void
  moveLink: (id: string, direction: -1 | 1) => void
  removeWallpaper: (id: string) => void
  removeLink: (id: string) => void
  resetAll: () => void
  resetLinks: () => void
  resetWallpapers: () => void
  setLinks: (links: QuickLink[]) => void
  setWallpaper: (wallpaper: string) => void
  updateLink: (id: string, patch: Partial<QuickLink>) => void
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
        })),
      addWallpaper: (wallpaper) =>
        set((state) => {
          const existing = state.wallpapers.find(
            (item) => item.src === wallpaper.src,
          )

          if (existing) {
            return {
              wallpaper: existing.src,
            }
          }

          const nextWallpaper = {
            id: createWallpaperId(),
            ...wallpaper,
          }

          return {
            wallpaper: nextWallpaper.src,
            wallpapers: [...state.wallpapers, nextWallpaper],
          }
        }),
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

          return { links }
        }),
      removeLink: (id) =>
        set((state) => ({
          links: state.links.filter((link) => link.id !== id),
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
          }
        }),
      resetAll: () => set(defaultUserConfig),
      resetLinks: () => set({ links: defaultLinks }),
      resetWallpapers: () =>
        set({
          wallpaper: appConfig.wallpaper,
          wallpapers: defaultWallpapers,
        }),
      setLinks: (links) => set({ links }),
      setWallpaper: (wallpaper) => set({ wallpaper }),
      updateLink: (id, patch) =>
        set((state) => ({
          links: state.links.map((link) =>
            link.id === id ? { ...link, ...patch } : link,
          ),
        })),
    }),
    {
      name: 'mypage-user-config-v2',
      partialize: (state) => ({
        wallpaper: state.wallpaper,
        wallpapers: state.wallpapers,
        links: state.links,
      }),
    },
  ),
)

export function createEffectiveConfig(snapshot: UserConfigSnapshot): AppConfig {
  return {
    ...appConfig,
    wallpaper: snapshot.wallpaper || appConfig.wallpaper,
    widgets: appConfig.widgets.map((widget) =>
      widget.type === 'links.grid'
        ? {
            ...widget,
            links: snapshot.links,
          }
        : widget,
    ),
  }
}
