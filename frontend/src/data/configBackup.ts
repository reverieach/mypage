import type { GridLayouts } from '../layout/defaultLayouts'
import type { UserConfigSnapshot } from '../store/useConfigStore'
import {
  fetchAgentEnvelope,
  postAgentEnvelope,
} from './apiClient'

export const CONFIG_SCHEMA_VERSION = 1

export type BackedUpConfig = {
  userConfig: UserConfigSnapshot
  layouts: GridLayouts
  layoutsUpdatedAt: string | null
}

export type AgentConfigData = {
  configured: boolean
  schemaVersion: number
  updatedAt: string | null
  snapshotCount: number
  config: BackedUpConfig | null
}

export type ConfigSnapshotListData = {
  items: Array<{
    id: number
    reason: string
    schemaVersion: number
    createdAt: string
  }>
}

export function configUpdatedAt(config: BackedUpConfig) {
  const timestamps = [
    config.userConfig.updatedAt,
    config.layoutsUpdatedAt,
  ].filter((value): value is string => Boolean(value))

  return timestamps.sort().at(-1) ?? new Date().toISOString()
}

export function loadAgentConfig() {
  return fetchAgentEnvelope<AgentConfigData>('/api/config/load')
}

export function saveAgentConfig(config: BackedUpConfig, reason = 'autosave') {
  return postAgentEnvelope<AgentConfigData>('/api/config/save', {
    reason,
    schemaVersion: CONFIG_SCHEMA_VERSION,
    updatedAt: configUpdatedAt(config),
    config,
  })
}

export function listAgentConfigSnapshots() {
  return fetchAgentEnvelope<ConfigSnapshotListData>('/api/config/snapshots')
}

export function restoreAgentConfigSnapshot(snapshotId: number) {
  return postAgentEnvelope<AgentConfigData>(
    `/api/config/snapshots/${snapshotId}/restore`,
  )
}
