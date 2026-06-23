import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { appConfig } from '../config/appConfig'
import type { AppConfig, QuickLink } from '../config/types'

const linksWidget = appConfig.widgets.find((widget) => widget.type === 'links.grid')
const defaultLinks = linksWidget?.type === 'links.grid' ? linksWidget.links : []

export type UserConfigSnapshot = {
  wallpaper: string
  links: QuickLink[]
}

type ConfigState = UserConfigSnapshot & {
  addLink: () => void
  importSnapshot: (snapshot: Partial<UserConfigSnapshot>) => void
  removeLink: (id: string) => void
  resetAll: () => void
  resetLinks: () => void
  setLinks: (links: QuickLink[]) => void
  setWallpaper: (wallpaper: string) => void
  updateLink: (id: string, patch: Partial<QuickLink>) => void
}

function createLinkId() {
  return `link-${Date.now().toString(36)}`
}

export const defaultUserConfig: UserConfigSnapshot = {
  wallpaper: appConfig.wallpaper,
  links: defaultLinks,
}

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      ...defaultUserConfig,
      addLink: () =>
        set((state) => ({
          links: [
            ...state.links,
            {
              id: createLinkId(),
              label: 'New Link',
              href: 'https://example.com',
            },
          ],
        })),
      importSnapshot: (snapshot) =>
        set((state) => ({
          wallpaper:
            typeof snapshot.wallpaper === 'string'
              ? snapshot.wallpaper
              : state.wallpaper,
          links: Array.isArray(snapshot.links) ? snapshot.links : state.links,
        })),
      removeLink: (id) =>
        set((state) => ({
          links: state.links.filter((link) => link.id !== id),
        })),
      resetAll: () => set(defaultUserConfig),
      resetLinks: () => set({ links: defaultLinks }),
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
      name: 'mypage-user-config',
      partialize: (state) => ({
        wallpaper: state.wallpaper,
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
