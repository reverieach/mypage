import type { ThemeId, ThemeTokens } from './types'

export const themes: Record<ThemeId, ThemeTokens> = {
  default: {
    id: 'default',
    name: 'Default Glass',
    className: 'theme-default',
    cardVariant: 'glass',
    searchVariant: 'floating',
    iconSet: 'lucide',
  },
}

export function getTheme(themeId: ThemeId) {
  return themes[themeId] ?? themes.default
}
