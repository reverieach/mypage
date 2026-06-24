from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
from pathlib import Path
from typing import BinaryIO

from app.services.cache import DATA_DIR

WALLPAPER_DIR = DATA_DIR / "wallpapers"

IMAGE_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".avif",
}
VIDEO_EXTENSIONS = {
    ".mp4",
    ".webm",
    ".mov",
}
MAX_WALLPAPER_BYTES = 250 * 1024 * 1024
WALLPAPER_CACHE_HEADERS = {
    "Cache-Control": "public, max-age=31536000, immutable",
}
POSTER_EXTENSION = ".jpg"


def _safe_stem(filename: str) -> str:
    stem = Path(filename).stem.strip().lower()
    stem = re.sub(r"[^a-z0-9._-]+", "-", stem)
    return stem.strip(".-_") or "wallpaper"


def _wallpaper_kind(extension: str) -> str:
    if extension in IMAGE_EXTENSIONS:
        return "image"

    if extension in VIDEO_EXTENSIONS:
        return "video"

    raise ValueError("Wallpaper must be an image or mp4/webm video")


def wallpaper_media_type(path: Path) -> str:
    extension = path.suffix.lower()

    return {
        ".avif": "image/avif",
        ".gif": "image/gif",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".mov": "video/quicktime",
        ".mp4": "video/mp4",
        ".png": "image/png",
        ".webm": "video/webm",
        ".webp": "image/webp",
    }.get(extension, "application/octet-stream")


def wallpaper_preview_url(video_name: str) -> str:
    return f"/api/wallpapers/posters/{video_name}"


def wallpaper_poster_path(video_path: Path) -> Path:
    return video_path.with_name(f"{video_path.stem}.poster{POSTER_EXTENSION}")


def _ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg
    except ImportError as exc:
        raise RuntimeError("imageio-ffmpeg is not installed") from exc

    return imageio_ffmpeg.get_ffmpeg_exe()


def _run_ffmpeg_poster(video_path: Path, output_path: Path, timestamp: str) -> None:
    temp_path = output_path.with_suffix(f".tmp{POSTER_EXTENSION}")
    temp_path.unlink(missing_ok=True)

    creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.run(
        [
            _ffmpeg_exe(),
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            timestamp,
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            str(temp_path),
        ],
        check=True,
        creationflags=creationflags,
        timeout=45,
    )
    temp_path.replace(output_path)


def ensure_wallpaper_preview(video_path: Path) -> Path | None:
    if video_path.suffix.lower() not in VIDEO_EXTENSIONS or not video_path.exists():
        return None

    poster_path = wallpaper_poster_path(video_path)

    if poster_path.exists() and poster_path.stat().st_size > 0:
        return poster_path

    for timestamp in ("00:00:00.500", "00:00:00.050"):
        try:
            _run_ffmpeg_poster(video_path, poster_path, timestamp)
        except (OSError, RuntimeError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
            continue

        if poster_path.exists() and poster_path.stat().st_size > 0:
            return poster_path

    poster_path.unlink(missing_ok=True)
    return None


def save_wallpaper_upload(
    file: BinaryIO,
    filename: str,
    content_type: str | None,
) -> dict[str, str]:
    extension = Path(filename).suffix.lower()
    kind = _wallpaper_kind(extension)
    WALLPAPER_DIR.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha1()
    size = 0
    temp_path = WALLPAPER_DIR / f".upload-{hashlib.sha1(filename.encode('utf-8')).hexdigest()[:12]}"

    with temp_path.open("wb") as output:
        while True:
            chunk = file.read(1024 * 1024)

            if not chunk:
                break

            size += len(chunk)

            if size > MAX_WALLPAPER_BYTES:
                output.close()
                temp_path.unlink(missing_ok=True)
                raise ValueError("Wallpaper file is too large")

            digest.update(chunk)
            output.write(chunk)

    file_hash = digest.hexdigest()[:16]
    safe_name = _safe_stem(filename)
    stored_name = f"{safe_name}-{file_hash}{extension}"
    stored_path = WALLPAPER_DIR / stored_name

    if stored_path.exists():
        temp_path.unlink(missing_ok=True)
    else:
        shutil.move(str(temp_path), stored_path)

    label = Path(filename).stem.strip() or "Wallpaper"
    preview = None

    if kind == "video" and ensure_wallpaper_preview(stored_path):
        preview = wallpaper_preview_url(stored_name)

    data = {
        "id": f"wallpaper-{file_hash}",
        "label": label,
        "kind": kind,
        "src": f"/api/wallpapers/files/{stored_name}",
        "contentType": content_type or "",
    }

    if preview:
        data["preview"] = preview

    return data
