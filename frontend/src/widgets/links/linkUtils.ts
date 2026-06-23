import type { QuickLink } from '../../config/types'

export function normalizeHref(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return ''
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  return `https://${trimmed}`
}

export function inferLinkLabel(href: string) {
  try {
    const hostname = new URL(normalizeHref(href)).hostname.replace(/^www\./, '')
    const firstPart = hostname.split('.')[0]

    return firstPart
      .split('-')
      .filter(Boolean)
      .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
      .join(' ') || 'New Link'
  } catch {
    return 'New Link'
  }
}

export function groupLinks(links: QuickLink[]) {
  return links.reduce<Record<string, QuickLink[]>>((groups, link) => {
    const category = link.category?.trim() || 'Other'
    groups[category] = [...(groups[category] ?? []), link]
    return groups
  }, {})
}
