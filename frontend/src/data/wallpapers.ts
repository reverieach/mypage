import { postAgentFormEnvelope, resolveAgentUrl } from './apiClient'
import type { SavedWallpaper } from '../store/useConfigStore'

export type UploadedWallpaper = SavedWallpaper & {
  contentType?: string
}

export async function uploadWallpaper(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const envelope = await postAgentFormEnvelope<UploadedWallpaper>(
    '/api/wallpapers/upload',
    formData,
  )

  return {
    ...envelope,
    data: {
      ...envelope.data,
      src: resolveAgentUrl(envelope.data.src),
      preview: envelope.data.preview
        ? resolveAgentUrl(envelope.data.preview)
        : envelope.data.preview,
      fallback: envelope.data.fallback
        ? resolveAgentUrl(envelope.data.fallback)
        : envelope.data.fallback,
    },
  }
}

export function deriveWallpaperPreview(src: string | undefined) {
  if (!src) {
    return undefined
  }

  try {
    const url = new URL(src, window.location.origin)
    const marker = '/api/wallpapers/files/'
    const markerIndex = url.pathname.indexOf(marker)

    if (markerIndex < 0) {
      return undefined
    }

    const fileName = decodeURIComponent(
      url.pathname.slice(markerIndex + marker.length),
    )

    if (!fileName) {
      return undefined
    }

    return resolveAgentUrl(
      `/api/wallpapers/posters/${encodeURIComponent(fileName)}`,
    )
  } catch {
    return undefined
  }
}
