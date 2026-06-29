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
  configured?: boolean
  date?: string
  weekday?: number
  weekdayLabel?: string
  weekNumber?: number | null
  term?: {
    name?: string
    startDate?: string | null
    maxWeek?: number | null
  }
  dayStatus?: 'no-class' | 'before-class' | 'in-class' | 'after-class'
  courses: Array<{
    id?: string
    name: string
    start?: string | null
    end?: string | null
    time?: string
    location: string
    teacher?: string
    sections?: number[]
    status?: 'finished' | 'current' | 'upcoming'
  }>
  currentCourse?: SchoolTodayData['courses'][number] | null
  nextCourse?: SchoolTodayData['courses'][number] | null
  notices: Array<{
    title: string
    time: string
  }>
  source?: string
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

export type WeatherSummaryData = {
  provider: string
  location: {
    id: string
    label: string
    latitude?: number
    longitude?: number
    timezone?: string
  }
  current: {
    time?: string | null
    temperature?: number | null
    apparentTemperature?: number | null
    condition?: string
    conditionLabel?: string
    precipitation?: number | null
    windSpeed?: number | null
    windGust?: number | null
    humidity?: number | null
    isDay?: boolean
  }
  hourly: Array<{
    time: string
    temperature?: number | null
    apparentTemperature?: number | null
    precipitationProbability?: number | null
    precipitation?: number | null
    condition: string
    conditionLabel: string
    windSpeed?: number | null
    windGust?: number | null
    humidity?: number | null
    uvIndex?: number | null
  }>
  daily: Array<{
    date: string
    condition: string
    conditionLabel: string
    temperatureMax?: number | null
    temperatureMin?: number | null
    apparentTemperatureMax?: number | null
    apparentTemperatureMin?: number | null
    precipitationProbabilityMax?: number | null
    precipitationSum?: number | null
    windSpeedMax?: number | null
    uvIndexMax?: number | null
    sunrise?: string | null
    sunset?: string | null
  }>
  summary: string
  suggestions: Array<{
    level: 'warning' | 'notice'
    kind: string
    message: string
  }>
  units: Record<string, string>
  lastRefreshAt?: string
  nextRefreshAt?: string
  sourceUrl?: string
  fromCache?: boolean
  lastError?: string
}

export type LanShareItem = {
  id: string
  kind: 'text' | 'file'
  title: string
  text?: string | null
  originalName?: string | null
  mediaType?: string | null
  size: number
  createdAt: string
  source: string
  isImage?: boolean
}

export type LanShareStatusData = {
  enabled: boolean
  port: number
  pin?: string | null
  localUrl: string
  urls: string[]
  primaryUrl: string
  shareDir: string
  fileDir: string
  maxFileBytes: number
  items: LanShareItem[]
}

export type NotificationCenterData = {
  items: Array<{
    id: string
    sourceItemId?: string
    source: 'github' | 'mail' | 'bilibili' | 'school' | 'system'
    title: string
    summary: string
    time: string
    importance?: 'critical' | 'important' | 'normal' | 'low'
    accountLabel?: string | null
    accountEmail?: string | null
    webLink?: string | null
    unread?: boolean
  }>
  enabledSources: string[]
}

export type MailSummaryData = {
  configured: boolean
  error?: string | null
  view?: 'priority' | 'unread'
  importantCount: number
  hiddenCount?: number
  counts?: {
    priority: number
    unread: number
    filtered: number
  }
  accounts: Array<{
    id: string
    label: string
    email: string
    lastSyncAt?: string | null
  }>
  items: Array<{
    id: string
    accountLabel: string
    accountEmail: string
    title: string
    sender: string
    receivedAt: string
    snippet: string
    summary: string
    importance: 'critical' | 'important' | 'normal' | 'low'
    needsAttention: boolean
    category: string
    actionItems: string[]
    deadline?: string | null
    displayReason: string
    webLink?: string | null
    analyzedAt?: string | null
    isPriority?: boolean
    filterReason?: string | null
  }>
}

export type HomeworkDueData = {
  windowLabel: string
  assignments: Array<{
    id: string
    name: string
    course: string
    deadline: string
    content?: string
  }>
}

export type SchoolNoticesData = {
  windowLabel: string
  sourceUrl: string
  hiddenCount?: number
  candidateCount?: number
  items: Array<{
    id: string
    title: string
    summary: string
    department?: string
    publishedAt: string
    deadline?: string | null
    importance: 'critical' | 'important' | 'normal' | 'low'
    priorityScore: number
    category: string
    displayReason?: string
    webLink: string
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
