from __future__ import annotations

import hashlib
import html
import re
import shutil
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

from app.services.cache import DATA_DIR

LINK_ICON_DIR = DATA_DIR / "link-icons"
MAX_ICON_BYTES = 512 * 1024
FETCH_TIMEOUT_SECONDS = 8

CONTENT_TYPE_EXTENSIONS = {
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
    "image/x-icon": ".ico",
    "image/vnd.microsoft.icon": ".ico",
}


def _normalize_href(href: str) -> urllib.parse.ParseResult:
    candidate = href.strip()

    if not candidate:
        raise ValueError("Link URL is required")

    if "://" not in candidate:
        candidate = f"https://{candidate}"

    parsed = urllib.parse.urlparse(candidate)

    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Link URL must be http or https")

    return parsed


def _domain_key(hostname: str) -> str:
    host = hostname.lower().strip(".")
    safe_host = re.sub(r"[^a-z0-9.-]+", "-", host).strip(".-") or "site"
    digest = hashlib.sha1(host.encode("utf-8")).hexdigest()[:16]
    return f"{safe_host}-{digest}"


def _existing_icon(domain_key: str) -> Path | None:
    for path in sorted(LINK_ICON_DIR.glob(f"{domain_key}.*")):
        if path.is_file():
            return path

    return None


def _extension_from_response(url: str, content_type: str | None) -> str:
    mime_type = (content_type or "").split(";", 1)[0].strip().lower()

    if mime_type in CONTENT_TYPE_EXTENSIONS:
        return CONTENT_TYPE_EXTENSIONS[mime_type]

    suffix = Path(urllib.parse.urlparse(url).path).suffix.lower()

    if suffix in {".avif", ".gif", ".ico", ".jpg", ".jpeg", ".png", ".svg", ".webp"}:
        return ".jpg" if suffix == ".jpeg" else suffix

    return ".png"


def _candidate_urls(parsed: urllib.parse.ParseResult) -> list[str]:
    host = parsed.hostname or ""
    root = f"{parsed.scheme}://{parsed.netloc}"
    urls = [
        f"{root}/favicon.ico",
        f"{root}/apple-touch-icon.png",
        f"{root}/apple-touch-icon-precomposed.png",
    ]

    if parsed.scheme != "https":
        urls.extend(
            [
                f"https://{host}/favicon.ico",
                f"https://{host}/apple-touch-icon.png",
            ],
        )

    urls.append(
        "https://www.google.com/s2/favicons?"
        + urllib.parse.urlencode({"domain": host, "sz": "128"}),
    )

    return urls


def _fetch_icon(url: str) -> tuple[bytes, str]:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
            "User-Agent": "MyPage/1.0 local favicon cache",
        },
    )

    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT_SECONDS) as response:
        content_type = response.headers.get("Content-Type")
        data = response.read(MAX_ICON_BYTES + 1)

    if len(data) > MAX_ICON_BYTES:
        raise ValueError("Icon file is too large")

    if not data:
        raise ValueError("Icon response was empty")

    return data, _extension_from_response(url, content_type)


def _fallback_svg(domain_key: str, hostname: str, label: str | None) -> Path:
    letter_source = (label or hostname).strip() or "?"
    letter = html.escape(letter_source[:1].upper())
    color_hash = hashlib.sha1(hostname.encode("utf-8")).hexdigest()
    hue = int(color_hash[:2], 16) % 360
    path = LINK_ICON_DIR / f"{domain_key}.svg"
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'
        f'<rect width="128" height="128" rx="32" fill="hsl({hue} 46% 42%)"/>'
        '<rect width="128" height="128" rx="32" fill="url(#g)" opacity=".55"/>'
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".42"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".24"/>'
        '</linearGradient></defs>'
        f'<text x="64" y="78" text-anchor="middle" font-family="Arial, sans-serif" '
        f'font-size="58" font-weight="700" fill="white">{letter}</text>'
        "</svg>"
    )
    path.write_text(svg, encoding="utf-8")
    return path


def _icon_response(path: Path, hostname: str, fetched: bool) -> dict[str, str | bool]:
    return {
        "domain": hostname,
        "icon": f"/api/link-icons/files/{path.name}",
        "cached": True,
        "fetched": fetched,
    }


def cache_link_icon(href: str, label: str | None = None, refresh: bool = False) -> dict[str, str | bool]:
    parsed = _normalize_href(href)
    hostname = (parsed.hostname or "").lower()
    domain_key = _domain_key(hostname)
    LINK_ICON_DIR.mkdir(parents=True, exist_ok=True)

    if not refresh:
        existing = _existing_icon(domain_key)

        if existing:
            return _icon_response(existing, hostname, fetched=False)

    for url in _candidate_urls(parsed):
        try:
            data, extension = _fetch_icon(url)
        except (OSError, urllib.error.URLError, ValueError):
            continue

        path = LINK_ICON_DIR / f"{domain_key}{extension}"
        temp_path = LINK_ICON_DIR / f".{domain_key}.tmp"
        temp_path.write_bytes(data)
        shutil.move(str(temp_path), path)
        return _icon_response(path, hostname, fetched=True)

    fallback = _fallback_svg(domain_key, hostname, label)
    return _icon_response(fallback, hostname, fetched=False)
