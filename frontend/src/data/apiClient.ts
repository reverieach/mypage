export const LOCAL_AGENT_BASE_URL = 'http://127.0.0.1:3217'

export type AgentEnvelope<T> = {
  updatedAt: string
  stale: boolean
  error: string | null
  data: T
}

export function resolveAgentUrl(endpoint: string) {
  if (endpoint.startsWith('http')) {
    return endpoint
  }

  return `${LOCAL_AGENT_BASE_URL}${endpoint}`
}
