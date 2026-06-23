import { useQuery } from '@tanstack/react-query'

import type { DataWidgetConfig } from '../config/types'
import { fetchAgentEnvelope } from './apiClient'

export type ContributionDay = {
  date: string
  count: number
  level: number
}

export type GitHubContributionsData = {
  total: number
  rangeLabel: string
  days: ContributionDay[]
}

export type SchoolTodayData = {
  courses: Array<{
    name: string
    time: string
    location: string
  }>
  notices: Array<{
    title: string
    time: string
  }>
}

export type CodexUsageData = {
  totalTokens: number
  inputTokens: number
  outputTokens: number
  sessions: number
  trend: Array<{
    day: string
    tokens: number
  }>
  topProjects: Array<{
    name: string
    tokens: number
  }>
}

export type AutomationDigestData = {
  summary: string
  items: Array<{
    title: string
    status: 'success' | 'warning' | 'failed'
    time: string
    detail: string
  }>
}

export type ScriptsStatusData = {
  agent: string
  healthy: number
  total: number
  tasks: Array<{
    name: string
    status: 'success' | 'warning' | 'failed'
    lastRun: string
  }>
}

export function useAgentWidget<T>(config: DataWidgetConfig) {
  return useQuery({
    queryKey: ['agent-widget', config.id, config.endpoint],
    queryFn: () => {
      if (!config.endpoint) {
        throw new Error('Widget endpoint is missing')
      }

      return fetchAgentEnvelope<T>(config.endpoint)
    },
    enabled: Boolean(config.endpoint),
    refetchInterval: config.refreshIntervalMs,
  })
}

export function formatTokenCount(tokens: number) {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}m`
  }

  if (tokens >= 1_000) {
    return `${Math.round(tokens / 1_000)}k`
  }

  return String(tokens)
}
