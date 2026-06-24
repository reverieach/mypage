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

export async function fetchAgentEnvelope<T>(
  endpoint: string,
): Promise<AgentEnvelope<T>> {
  const response = await fetch(resolveAgentUrl(endpoint))

  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}`)
  }

  return response.json() as Promise<AgentEnvelope<T>>
}

export async function postAgentEnvelope<T>(
  endpoint: string,
  body?: unknown,
): Promise<AgentEnvelope<T>> {
  const response = await fetch(resolveAgentUrl(endpoint), {
    method: 'POST',
    headers: body === undefined ? undefined : {
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}`)
  }

  return response.json() as Promise<AgentEnvelope<T>>
}

export async function postAgentFormEnvelope<T>(
  endpoint: string,
  formData: FormData,
): Promise<AgentEnvelope<T>> {
  const response = await fetch(resolveAgentUrl(endpoint), {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error(`Agent returned ${response.status}`)
  }

  return response.json() as Promise<AgentEnvelope<T>>
}
