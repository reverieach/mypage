type WallpaperLayerProps = {
  src: string
}

export function WallpaperLayer({ src }: WallpaperLayerProps) {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden bg-slate-950">
      <img
        src={src}
        alt=""
        className="h-full w-full scale-105 object-cover"
        draggable={false}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.28),rgba(15,23,42,0.2)_38%,rgba(15,23,42,0.58)_100%)]" />
      <div className="absolute inset-0 backdrop-blur-[1px]" />
    </div>
  )
}
