from __future__ import annotations

import hashlib
import http.client
import ipaddress
import json
import mimetypes
import os
import re
import secrets
import shutil
import socket
import sqlite3
import struct
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import BinaryIO, Any

from app.services.cache import now_iso

LOCAL_TZ = timezone(timedelta(hours=8))
SHARE_PORT = int(os.getenv("MYPAGE_SHARE_PORT", "3220"))
_DEFAULT_SHARE_DIR = "E:/MyPageShare" if sys.platform == "win32" else str(Path.home() / "MyPageShare")
SHARE_DIR = Path(os.getenv("MYPAGE_SHARE_DIR", _DEFAULT_SHARE_DIR))
SHARE_DB_PATH = Path(os.getenv("MYPAGE_SHARE_DB_PATH", str(SHARE_DIR / "lan_share.sqlite3")))
SHARE_FILE_DIR = Path(os.getenv("MYPAGE_SHARE_FILE_DIR", str(SHARE_DIR / "files")))
SHARE_MAX_FILE_BYTES = int(os.getenv("MYPAGE_SHARE_MAX_FILE_BYTES", str(200 * 1024 * 1024)))
SHARE_TOKEN_DAYS = int(os.getenv("MYPAGE_SHARE_TOKEN_DAYS", "7"))
_IPV4_RE = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")
_VIRTUAL_ADAPTER_KEYWORDS = (
    "bluetooth",
    "clash",
    "docker",
    "hyper-v",
    "loopback",
    "meta",
    "mihomo",
    "tap",
    "tailscale",
    "tun",
    "virtual",
    "vmnet",
    "vmware",
    "vpn",
    "wireguard",
    "wsl",
    "zerotier",
)
_EXCLUDED_IP_NETWORKS = tuple(
    ipaddress.ip_network(value)
    for value in (
        "0.0.0.0/8",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "198.18.0.0/15",
        "224.0.0.0/4",
    )
)


def _connect() -> sqlite3.Connection:
    SHARE_DIR.mkdir(parents=True, exist_ok=True)
    SHARE_FILE_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(SHARE_DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_schema() -> None:
    with _connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS share_meta (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS share_tokens (
              token_hash TEXT PRIMARY KEY,
              created_at TEXT NOT NULL,
              expires_at TEXT NOT NULL,
              last_seen_at TEXT
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS share_items (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              title TEXT NOT NULL,
              text TEXT,
              file_name TEXT,
              original_name TEXT,
              media_type TEXT,
              size INTEGER,
              created_at TEXT NOT NULL,
              source TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_share_items_created
            ON share_items (created_at DESC)
            """
        )
        connection.commit()


def _get_meta(connection: sqlite3.Connection, key: str) -> str | None:
    row = connection.execute("SELECT value FROM share_meta WHERE key = ?", (key,)).fetchone()
    return str(row["value"]) if row else None


def _set_meta(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        """
        INSERT INTO share_meta (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (key, value, now_iso()),
    )


def get_or_create_pin() -> str:
    ensure_schema()

    with _connect() as connection:
        pin = _get_meta(connection, "pin")

        if pin and pin.isdigit() and len(pin) == 6:
            return pin

        pin = f"{secrets.randbelow(1_000_000):06d}"
        _set_meta(connection, "pin", pin)
        connection.commit()
        return pin


def reset_pin() -> str:
    ensure_schema()

    with _connect() as connection:
        pin = f"{secrets.randbelow(1_000_000):06d}"
        _set_meta(connection, "pin", pin)
        connection.execute("DELETE FROM share_tokens")
        connection.commit()
        return pin


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def authenticate_pin(pin: str) -> dict[str, Any]:
    expected = get_or_create_pin()

    if pin.strip() != expected:
        raise PermissionError("PIN is incorrect")

    token = secrets.token_urlsafe(32)
    now = datetime.now(LOCAL_TZ)
    expires_at = now + timedelta(days=SHARE_TOKEN_DAYS)

    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO share_tokens (token_hash, created_at, expires_at, last_seen_at)
            VALUES (?, ?, ?, ?)
            """,
            (_hash_token(token), now.isoformat(), expires_at.isoformat(), now.isoformat()),
        )
        connection.commit()

    return {"token": token, "expiresAt": expires_at.isoformat()}


def validate_token(token: str | None) -> bool:
    if not token:
        return False

    ensure_schema()
    token_hash = _hash_token(token)
    now = datetime.now(LOCAL_TZ)

    with _connect() as connection:
        row = connection.execute(
            "SELECT expires_at FROM share_tokens WHERE token_hash = ?",
            (token_hash,),
        ).fetchone()

        if not row:
            return False

        try:
            expires_at = datetime.fromisoformat(str(row["expires_at"]))
        except ValueError:
            return False

        if expires_at < now:
            connection.execute("DELETE FROM share_tokens WHERE token_hash = ?", (token_hash,))
            connection.commit()
            return False

        connection.execute(
            "UPDATE share_tokens SET last_seen_at = ? WHERE token_hash = ?",
            (now.isoformat(), token_hash),
        )
        connection.commit()
        return True


def _item_from_row(row: sqlite3.Row) -> dict[str, Any]:
    media_type = str(row["media_type"] or "")

    return {
        "id": str(row["id"]),
        "kind": str(row["kind"]),
        "title": str(row["title"] or ""),
        "text": row["text"],
        "originalName": row["original_name"],
        "mediaType": media_type or None,
        "size": int(row["size"] or 0),
        "createdAt": str(row["created_at"]),
        "source": str(row["source"] or "unknown"),
        "isImage": media_type.startswith("image/"),
    }


def list_items(limit: int = 50) -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM share_items
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (max(1, min(limit, 200)),),
        ).fetchall()

    return {"items": [_item_from_row(row) for row in rows]}


def add_text(text: str, source: str = "desktop") -> dict[str, Any]:
    normalized = text.strip()

    if not normalized:
        raise ValueError("Text is required")

    ensure_schema()
    item_id = f"text-{datetime.now(LOCAL_TZ).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}"
    title = normalized.splitlines()[0][:80] or "Text"

    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO share_items (id, kind, title, text, created_at, source)
            VALUES (?, 'text', ?, ?, ?, ?)
            """,
            (item_id, title, normalized, now_iso(), source),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM share_items WHERE id = ?", (item_id,)).fetchone()

    return _item_from_row(row)


def _safe_original_name(file_name: str) -> str:
    name = Path(file_name or "file").name.strip() or "file"
    return name.replace("\x00", "")


def save_file(
    file_obj: BinaryIO,
    file_name: str,
    media_type: str | None = None,
    source: str = "desktop",
) -> dict[str, Any]:
    ensure_schema()
    original_name = _safe_original_name(file_name)
    suffix = Path(original_name).suffix[:20]
    item_id = f"file-{datetime.now(LOCAL_TZ).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(4)}"
    stored_name = f"{item_id}{suffix}"
    target = SHARE_FILE_DIR / stored_name
    size = 0

    with target.open("wb") as output:
        while True:
            chunk = file_obj.read(1024 * 1024)

            if not chunk:
                break

            size += len(chunk)

            if size > SHARE_MAX_FILE_BYTES:
                output.close()
                target.unlink(missing_ok=True)
                raise ValueError(f"File exceeds {SHARE_MAX_FILE_BYTES} bytes")

            output.write(chunk)

    detected_type = media_type or mimetypes.guess_type(original_name)[0] or "application/octet-stream"

    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO share_items (
              id, kind, title, file_name, original_name, media_type, size, created_at, source
            )
            VALUES (?, 'file', ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item_id,
                original_name,
                stored_name,
                original_name,
                detected_type,
                size,
                now_iso(),
                source,
            ),
        )
        connection.commit()
        row = connection.execute("SELECT * FROM share_items WHERE id = ?", (item_id,)).fetchone()

    return _item_from_row(row)


def get_file_record(item_id: str) -> tuple[Path, dict[str, Any]]:
    ensure_schema()

    with _connect() as connection:
        row = connection.execute(
            "SELECT * FROM share_items WHERE id = ? AND kind = 'file'",
            (item_id,),
        ).fetchone()

    if not row:
        raise FileNotFoundError(item_id)

    stored_name = Path(str(row["file_name"] or "")).name
    path = (SHARE_FILE_DIR / stored_name).resolve()
    root = SHARE_FILE_DIR.resolve()

    if root not in path.parents or not path.exists():
        raise FileNotFoundError(item_id)

    return path, _item_from_row(row)


def reveal_file(item_id: str) -> dict[str, Any]:
    path, item = get_file_record(item_id)

    if sys.platform == "darwin":
        subprocess.run(["open", "-R", str(path)], check=True, timeout=10)
        return {"opened": True, "path": str(path), "item": item}

    if sys.platform != "win32":
        raise OSError("Reveal in folder is only supported on Windows")

    subprocess.Popen(
        ["explorer.exe", f"/select,{path}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {"opened": True, "path": str(path), "item": item}


def copy_file_to_clipboard(item_id: str) -> dict[str, Any]:
    path, item = get_file_record(item_id)

    if sys.platform == "darwin":
        subprocess.run(
            ["osascript", "-e", "on run argv\nset the clipboard to (POSIX file (item 1 of argv) as alias)\nend run", str(path)],
            check=True, timeout=10, capture_output=True,
        )
        return {"copied": True, "path": str(path), "item": item}

    if sys.platform != "win32":
        raise OSError("Copy file is only supported on Windows")

    _copy_paths_to_windows_clipboard([path])
    return {"copied": True, "path": str(path), "item": item}


def _copy_paths_to_windows_clipboard(paths: list[Path]) -> None:
    import ctypes

    user32 = ctypes.windll.user32
    kernel32 = ctypes.windll.kernel32

    user32.OpenClipboard.argtypes = [ctypes.c_void_p]
    user32.OpenClipboard.restype = ctypes.c_bool
    user32.EmptyClipboard.argtypes = []
    user32.EmptyClipboard.restype = ctypes.c_bool
    user32.SetClipboardData.argtypes = [ctypes.c_uint, ctypes.c_void_p]
    user32.SetClipboardData.restype = ctypes.c_void_p
    user32.CloseClipboard.argtypes = []
    user32.CloseClipboard.restype = ctypes.c_bool

    kernel32.GlobalAlloc.argtypes = [ctypes.c_uint, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = ctypes.c_void_p
    kernel32.GlobalLock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [ctypes.c_void_p]
    kernel32.GlobalUnlock.restype = ctypes.c_bool
    kernel32.GlobalFree.argtypes = [ctypes.c_void_p]
    kernel32.GlobalFree.restype = ctypes.c_void_p
    kernel32.RtlMoveMemory.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_size_t]

    cf_hdrop = 15
    gmem_moveable = 0x0002
    gmem_zeroinit = 0x0040
    dropfiles_size = 20
    file_list = "\0".join(str(path.resolve()) for path in paths) + "\0\0"
    payload = struct.pack("<IiiII", dropfiles_size, 0, 0, 0, 1) + file_list.encode("utf-16le")
    handle = kernel32.GlobalAlloc(gmem_moveable | gmem_zeroinit, len(payload))

    if not handle:
        raise OSError("Could not allocate clipboard memory")

    locked = kernel32.GlobalLock(handle)

    if not locked:
        kernel32.GlobalFree(handle)
        raise OSError("Could not lock clipboard memory")

    ctypes.memmove(locked, payload, len(payload))
    kernel32.GlobalUnlock(handle)

    if not user32.OpenClipboard(None):
        kernel32.GlobalFree(handle)
        raise OSError("Could not open clipboard")

    try:
        if not user32.EmptyClipboard():
            raise OSError("Could not clear clipboard")

        if not user32.SetClipboardData(cf_hdrop, handle):
            raise OSError("Could not set clipboard data")

        handle = None
    finally:
        user32.CloseClipboard()

        if handle:
            kernel32.GlobalFree(handle)


def delete_item(item_id: str) -> bool:
    ensure_schema()

    with _connect() as connection:
        row = connection.execute("SELECT * FROM share_items WHERE id = ?", (item_id,)).fetchone()

        if not row:
            return False

        if str(row["kind"]) == "file" and row["file_name"]:
            (SHARE_FILE_DIR / Path(str(row["file_name"])).name).unlink(missing_ok=True)

        connection.execute("DELETE FROM share_items WHERE id = ?", (item_id,))
        connection.commit()
        return True


def clear_items() -> dict[str, int]:
    ensure_schema()

    with _connect() as connection:
        count = connection.execute("SELECT COUNT(*) AS count FROM share_items").fetchone()["count"]
        connection.execute("DELETE FROM share_items")
        connection.commit()

    if SHARE_FILE_DIR.exists():
        for path in SHARE_FILE_DIR.iterdir():
            if path.is_file():
                path.unlink(missing_ok=True)
            elif path.is_dir():
                shutil.rmtree(path, ignore_errors=True)

    return {"deleted": int(count or 0)}


def _default_lan_ip() -> str | None:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return str(sock.getsockname()[0])
    except OSError:
        return None


def _append_unique(values: list[str], ip: str) -> None:
    if ip not in values:
        values.append(ip)


def _is_shareable_lan_ip(ip: str) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return False

    if not isinstance(address, ipaddress.IPv4Address):
        return False

    return not any(address in network for network in _EXCLUDED_IP_NETWORKS)


def _adapter_looks_virtual(name: str) -> bool:
    normalized = name.casefold()
    return any(keyword in normalized for keyword in _VIRTUAL_ADAPTER_KEYWORDS)


def _candidate_ips_from_ipconfig() -> list[str]:
    if sys.platform != "win32":
        return []

    try:
        completed = subprocess.run(
            ["ipconfig"],
            check=False,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
            timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    adapters: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    reading_gateway = False

    for raw_line in completed.stdout.splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()

        if stripped.endswith(":") and not raw_line[:1].isspace():
            current = {
                "name": stripped[:-1],
                "ips": [],
                "hasGateway": False,
            }
            adapters.append(current)
            reading_gateway = False
            continue

        if current is None:
            continue

        if "IPv4" in stripped:
            for match in _IPV4_RE.findall(stripped):
                if _is_shareable_lan_ip(match):
                    current["ips"].append(match)

        if "Default Gateway" in stripped:
            reading_gateway = True
            gateway_value = stripped.split(":", 1)[-1]
            if _IPV4_RE.search(gateway_value):
                current["hasGateway"] = True
            continue

        if reading_gateway:
            if not raw_line[:1].isspace() or not stripped:
                reading_gateway = False
            elif _IPV4_RE.search(stripped):
                current["hasGateway"] = True

    values: list[str] = []
    fallback_values: list[str] = []

    for adapter in adapters:
        ips = adapter["ips"]
        if not ips or _adapter_looks_virtual(str(adapter["name"])):
            continue

        target = values if adapter["hasGateway"] else fallback_values
        for ip in ips:
            _append_unique(target, ip)

    for ip in fallback_values:
        _append_unique(values, ip)

    return values


def _candidate_ips(*, physical_only: bool = False) -> list[str]:
    values: list[str] = []

    if sys.platform == 'darwin':
        try:
            output = subprocess.run(['/sbin/ifconfig'], capture_output=True, text=True, timeout=3, check=False).stdout
            physical = False
            for line in output.splitlines():
                if line and not line[0].isspace():
                    physical = not _adapter_looks_virtual(line.split(':')[0]) and 'UP,' in line
                elif physical and line.strip().startswith('inet '):
                    ip = line.split()[1]
                    if _is_shareable_lan_ip(ip):
                        _append_unique(values, ip)
        except (OSError, subprocess.SubprocessError):
            pass

    for ip in _candidate_ips_from_ipconfig():
        _append_unique(values, ip)

    if physical_only:
        return values

    default_ip = _default_lan_ip()
    if default_ip and _is_shareable_lan_ip(default_ip):
        _append_unique(values, default_ip)

    try:
        host = socket.gethostname()
        for info in socket.getaddrinfo(host, None, family=socket.AF_INET):
            ip = str(info[4][0])

            if _is_shareable_lan_ip(ip):
                _append_unique(values, ip)
    except OSError:
        pass

    return values


def _port_is_listening(port: int = SHARE_PORT) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.2):
            return True
    except OSError:
        return False


def share_status(include_pin: bool = True) -> dict[str, Any]:
    pin = get_or_create_pin() if include_pin else None
    ips = _candidate_ips()
    urls = [f"http://{ip}:{SHARE_PORT}/share" for ip in ips]
    local_url = f"http://127.0.0.1:{SHARE_PORT}/share"
    stun_urls = []
    connection = http.client.HTTPConnection('127.0.0.1', SHARE_PORT, timeout=0.5)
    try:
        connection.request('GET', '/api/share/stun')
        response = connection.getresponse()
        if response.status == 200:
            stun_urls = json.loads(response.read(4096)).get('urls', [])
    except (OSError, ValueError, http.client.HTTPException):
        pass
    finally:
        connection.close()

    return {
        "enabled": _port_is_listening(),
        "port": SHARE_PORT,
        "stunUrls": stun_urls,
        "pin": pin,
        "localUrl": local_url,
        "urls": urls,
        "primaryUrl": urls[0] if urls else local_url,
        "shareDir": str(SHARE_DIR),
        "fileDir": str(SHARE_FILE_DIR),
        "maxFileBytes": SHARE_MAX_FILE_BYTES,
    }
