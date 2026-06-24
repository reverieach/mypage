import { useEffect, useRef, useState } from 'react'

type WallpaperLayerProps = {
  src: string
  kind?: 'image' | 'video'
  preview?: string
}

const videoMountDelayMs = 450

export function WallpaperLayer({ kind = 'image', preview, src }: WallpaperLayerProps) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-slate-950">
      {kind === 'video' ? (
        <VideoWallpaper key={src} preview={preview} src={src} />
      ) : (
        <img
          src={src}
          alt=""
          className="h-full w-full scale-105 object-cover"
          draggable={false}
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),rgba(15,23,42,0.2)_38%,rgba(15,23,42,0.58)_100%)]" />
      {kind !== 'video' ? <div className="absolute inset-0 backdrop-blur-[1px]" /> : null}
    </div>
  )
}

function VideoWallpaper({ preview, src }: Pick<WallpaperLayerProps, 'preview' | 'src'>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mountVideo, setMountVideo] = useState(false)
  const [videoReady, setVideoReady] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMountVideo(true)
    }, videoMountDelayMs)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  useEffect(() => {
    function syncPlayback() {
      const video = videoRef.current

      if (!video) {
        return
      }

      if (document.hidden) {
        video.pause()
      } else {
        void video.play().catch(() => {
          // Autoplay can be transiently blocked while a new tab is warming up.
        })
      }
    }

    document.addEventListener('visibilitychange', syncPlayback)
    return () => document.removeEventListener('visibilitychange', syncPlayback)
  }, [])

  return (
    <>
      {preview ? (
        <img
          src={preview}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : null}
      {mountVideo ? (
        <video
          ref={videoRef}
          src={src}
          poster={preview}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            videoReady ? 'opacity-100' : 'opacity-0'
          }`}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          onCanPlay={() => setVideoReady(true)}
        />
      ) : null}
    </>
  )
}
