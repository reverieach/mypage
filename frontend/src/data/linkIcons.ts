import { postAgentEnvelope, resolveAgentUrl } from './apiClient'

export type CachedLinkIcon = {
  domain: string
  icon: string
  cached: boolean
  fetched: boolean
}

export async function cacheLinkIcon(
  href: string,
  label?: string,
  refresh = false,
) {
  const envelope = await postAgentEnvelope<CachedLinkIcon>('/api/link-icons/cache', {
    href,
    label,
    refresh,
  })

  return {
    ...envelope,
    data: {
      ...envelope.data,
      icon: envelope.data.icon ? resolveAgentUrl(envelope.data.icon) : '',
    },
  }
}
