from typing import Any

from fastapi import APIRouter, Body

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
