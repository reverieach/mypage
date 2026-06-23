import type { AppConfig } from './types'

export const appConfig: AppConfig = {
  theme: 'default',
  wallpaper: '/wallpapers/default.png',
  searchEngines: [
    {
      id: 'google',
      label: 'Google',
      url: 'https://www.google.com/search?q={query}',
    },
    {
      id: 'github',
      label: 'GitHub',
      prefix: 'gh',
      url: 'https://github.com/search?q={query}&type=repositories',
    },
    {
      id: 'npm',
      label: 'npm',
      prefix: 'npm',
      url: 'https://www.npmjs.com/search?q={query}',
    },
    {
      id: 'bilibili',
      label: 'Bilibili',
      prefix: 'b',
      url: 'https://search.bilibili.com/all?keyword={query}',
    },
  ],
  widgets: [
    {
      id: 'links',
      type: 'links.grid',
      title: 'Links',
      layout: { x: 0, y: 0, w: 4, h: 3, minW: 3, minH: 2 },
      links: [
        { id: 'github', label: 'GitHub', href: 'https://github.com' },
        { id: 'gmail', label: 'Gmail', href: 'https://mail.google.com' },
        { id: 'bilibili', label: 'Bilibili', href: 'https://www.bilibili.com' },
        { id: 'openai', label: 'OpenAI', href: 'https://chatgpt.com' },
        { id: 'notion', label: 'Notion', href: 'https://www.notion.so' },
        { id: 'youtube', label: 'YouTube', href: 'https://www.youtube.com' },
      ],
    },
    {
      id: 'github-heatmap',
      type: 'github.heatmap',
      title: 'GitHub',
      layout: { x: 4, y: 0, w: 5, h: 3, minW: 4, minH: 2 },
      endpoint: '/api/github/contributions',
      refreshIntervalMs: 30 * 60 * 1000,
    },
    {
      id: 'school-today',
      type: 'school.today',
      title: 'Today',
      layout: { x: 9, y: 0, w: 3, h: 3, minW: 3, minH: 2 },
      endpoint: '/api/school/today',
      refreshIntervalMs: 10 * 60 * 1000,
    },
    {
      id: 'codex-usage',
      type: 'codex.usage',
      title: 'Codex',
      layout: { x: 0, y: 3, w: 4, h: 3, minW: 3, minH: 2 },
      endpoint: '/api/codex/usage/today',
      refreshIntervalMs: 10 * 60 * 1000,
    },
    {
      id: 'automation-digest',
      type: 'automation.digest',
      title: 'Automation',
      layout: { x: 4, y: 3, w: 5, h: 3, minW: 4, minH: 2 },
      endpoint: '/api/automation/digest',
      refreshIntervalMs: 5 * 60 * 1000,
    },
    {
      id: 'scripts-status',
      type: 'scripts.status',
      title: 'Scripts',
      layout: { x: 9, y: 3, w: 3, h: 3, minW: 3, minH: 2 },
      endpoint: '/api/scripts/status',
      refreshIntervalMs: 30 * 1000,
    },
  ],
}
