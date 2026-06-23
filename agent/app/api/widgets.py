from typing import Any

from fastapi import APIRouter

from app.sample_data import (
    AUTOMATION_DIGEST,
    CODEX_USAGE_TODAY,
    GITHUB_CONTRIBUTIONS,
    HOMEWORK_DUE,
    NOTIFICATIONS_CENTER,
    SCHOOL_TODAY,
    SCRIPTS_STATUS,
)
from app.services.cache import envelope, read_cached_or_sample
from app.services.homework import read_due_homework
from app.services.message_pipeline import (
    mail_summary,
    notification_center,
    refresh_mail,
)

router = APIRouter(prefix="/api")


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


@router.get("/homework/due")
def homework_due() -> dict[str, Any]:
    try:
        return envelope(read_due_homework(days=3), stale=False)
    except OSError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework read failed: {exc}")
    except ValueError as exc:
        return envelope(HOMEWORK_DUE, stale=True, error=f"homework parse failed: {exc}")
