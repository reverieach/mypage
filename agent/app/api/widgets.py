from typing import Any
from pathlib import Path

from fastapi import APIRouter, Body, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.sample_data import (
    AUTOMATION_DIGEST,
    CODEX_USAGE_TODAY,
    GITHUB_CONTRIBUTIONS,
    HOMEWORK_DUE,
    NOTIFICATIONS_CENTER,
    SCHOOL_NOTICES,
    SCHOOL_TODAY,
    SCRIPTS_STATUS,
)
from app.services.cache import envelope, read_cached_or_sample
from app.services.homework import read_due_homework, refresh_due_homework
from app.services.link_icons import (
    LINK_ICON_DIR,
    cache_link_icon,
    icon_media_type,
    resolve_link_icon_file,
)
from app.services.message_pipeline import (
    dismiss_mail_message,
    mail_summary,
    microsoft_auth_status,
    notification_center,
    poll_microsoft_device_auth,
    refresh_mail,
    start_microsoft_device_auth,
)
from app.services.school_notices import (
    dismiss_school_notice,
    read_school_notices,
    refresh_school_notices,
)
from app.services.user_config import (
    list_config_snapshots,
    load_user_config,
    restore_config_snapshot,
    save_user_config,
)
from app.services.wallpapers import (
    WALLPAPER_CACHE_HEADERS,
    WALLPAPER_DIR,
    ensure_wallpaper_preview,
    save_wallpaper_upload,
    wallpaper_media_type,
)

router = APIRouter(prefix="/api")


@router.get("/config/load")
def config_load() -> dict[str, Any]:
    return envelope(load_user_config(), stale=False)


@router.post("/config/save")
def config_save(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    reason = str(payload.get("reason") or "autosave")
    return envelope(save_user_config(payload, reason=reason), stale=False)


@router.get("/config/snapshots")
def config_snapshots() -> dict[str, Any]:
    return envelope(list_config_snapshots(), stale=False)


@router.post("/config/snapshots/{snapshot_id}/restore")
def config_snapshot_restore(snapshot_id: int) -> dict[str, Any]:
    try:
        return envelope(restore_config_snapshot(snapshot_id), stale=False)
    except ValueError as exc:
        return envelope(
            {"configured": False, "config": None, "snapshotCount": 0},
            stale=True,
            error=str(exc),
        )


@router.post("/wallpapers/upload")
def wallpaper_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        data = save_wallpaper_upload(
            file.file,
            file.filename or "wallpaper",
            file.content_type,
        )
        return envelope(data, stale=False)
    except ValueError as exc:
        return envelope(
            {"id": "", "label": "", "kind": "image", "src": ""},
            stale=True,
            error=str(exc),
        )


@router.get("/wallpapers/files/{file_name}")
def wallpaper_file(file_name: str) -> FileResponse:
    path = (WALLPAPER_DIR / file_name).resolve()
    root = WALLPAPER_DIR.resolve()

    if root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Wallpaper file not found")

    return FileResponse(
        path,
        media_type=wallpaper_media_type(path),
        headers=WALLPAPER_CACHE_HEADERS,
    )


@router.get("/wallpapers/posters/{file_name}")
def wallpaper_poster(file_name: str) -> FileResponse:
    path = (WALLPAPER_DIR / file_name).resolve()
    root = WALLPAPER_DIR.resolve()

    if root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Wallpaper file not found")

    poster_path = ensure_wallpaper_preview(path)

    if not poster_path:
        raise HTTPException(status_code=404, detail="Wallpaper poster not found")

    return FileResponse(
        poster_path,
        media_type="image/jpeg",
        headers=WALLPAPER_CACHE_HEADERS,
    )


@router.post("/link-icons/cache")
def link_icon_cache(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    try:
        data = cache_link_icon(
            str(payload.get("href") or ""),
            label=str(payload.get("label") or ""),
            refresh=bool(payload.get("refresh") or False),
        )
        return envelope(data, stale=False)
    except ValueError as exc:
        return envelope(
            {"domain": "", "icon": "", "cached": False, "fetched": False},
            stale=True,
            error=str(exc),
        )


@router.get("/link-icons/resolve")
def link_icon_resolve(
    href: str,
    label: str | None = None,
    refresh: bool = False,
) -> FileResponse:
    try:
        path = resolve_link_icon_file(href, label=label, refresh=refresh)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return FileResponse(path, media_type=icon_media_type(path))


@router.get("/link-icons/files/{file_name}")
def link_icon_file(file_name: str) -> FileResponse:
    path = (LINK_ICON_DIR / file_name).resolve()
    root = LINK_ICON_DIR.resolve()

    if root not in path.parents:
        raise HTTPException(status_code=404, detail="Link icon not found")

    if not path.exists():
        path = next(
            (
                candidate.resolve()
                for candidate in LINK_ICON_DIR.glob(f"{Path(file_name).stem}.*")
                if candidate.is_file()
            ),
            path,
        )

    if root not in path.parents or not path.exists():
        raise HTTPException(status_code=404, detail="Link icon not found")

    return FileResponse(path)


@router.get("/school/today")
def school_today() -> dict[str, Any]:
    return read_cached_or_sample("school_today.json", SCHOOL_TODAY)


@router.get("/github/contributions")
def github_contributions() -> dict[str, Any]:
    return read_cached_or_sample("github_contributions.json", GITHUB_CONTRIBUTIONS)


@router.get("/codex/usage/today")
def codex_usage_today() -> dict[str, Any]:
    return read_cached_or_sample("codex_usage_today.json", CODEX_USAGE_TODAY)


@router.get("/automation/digest")
def automation_digest() -> dict[str, Any]:
    return read_cached_or_sample("automation_digest.json", AUTOMATION_DIGEST)


@router.get("/scripts/status")
def scripts_status() -> dict[str, Any]:
    return read_cached_or_sample("scripts_status.json", SCRIPTS_STATUS)


@router.get("/notifications")
def notifications() -> dict[str, Any]:
    data = notification_center()

    if data["items"]:
        return envelope(data, stale=False)

    return read_cached_or_sample("notifications.json", NOTIFICATIONS_CENTER)


@router.get("/mail/summary")
def mail_summary_endpoint() -> dict[str, Any]:
    return envelope(mail_summary(), stale=False)


@router.post("/mail/refresh")
def mail_refresh_endpoint() -> dict[str, Any]:
    return envelope(refresh_mail(), stale=False)


@router.post("/mail/messages/{message_id}/dismiss")
def mail_dismiss_endpoint(message_id: str) -> dict[str, Any]:
    return envelope(dismiss_mail_message(message_id), stale=False)


@router.get("/mail/microsoft/status")
def microsoft_status_endpoint() -> dict[str, Any]:
    return envelope(microsoft_auth_status(), stale=False)


@router.post("/mail/microsoft/device/start")
def microsoft_device_start_endpoint(account_id: str | None = None) -> dict[str, Any]:
    return envelope(start_microsoft_device_auth(account_id), stale=False)


@router.post("/mail/microsoft/device/poll")
def microsoft_device_poll_endpoint(account_id: str, device_code: str) -> dict[str, Any]:
    return envelope(
        poll_microsoft_device_auth(account_id, device_code),
        stale=False,
    )


@router.get("/homework/due")
def homework_due() -> dict[str, Any]:
    try:
        return envelope(read_due_homework(days=3), stale=False)
    except OSError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework read failed: {exc}")
    except ValueError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework parse failed: {exc}")


@router.post("/homework/refresh")
def homework_refresh() -> dict[str, Any]:
    try:
        return envelope(refresh_due_homework(days=3), stale=False)
    except OSError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework refresh failed: {exc}")
    except TimeoutError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework refresh timed out: {exc}")
    except RuntimeError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=str(exc))
    except ValueError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework refresh config failed: {exc}")


@router.get("/school/notices")
def school_notices() -> dict[str, Any]:
    try:
        return envelope(read_school_notices(days=2), stale=False)
    except PermissionError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=str(exc))
    except OSError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=f"school notices read failed: {exc}")
    except ValueError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=f"school notices parse failed: {exc}")


@router.post("/school/notices/refresh")
def school_notices_refresh() -> dict[str, Any]:
    try:
        return envelope(refresh_school_notices(days=2), stale=False)
    except PermissionError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=str(exc))
    except TimeoutError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=f"school notices refresh timed out: {exc}")
    except OSError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=f"school notices refresh failed: {exc}")
    except RuntimeError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=str(exc))
    except ValueError as exc:
        return envelope(SCHOOL_NOTICES, stale=True, error=f"school notices refresh config failed: {exc}")


@router.post("/school/notices/{notice_id}/dismiss")
def school_notices_dismiss(notice_id: str) -> dict[str, Any]:
    try:
        return envelope(dismiss_school_notice(notice_id), stale=False)
    except ValueError as exc:
        return envelope({"id": notice_id, "dismissed": False}, stale=True, error=str(exc))
