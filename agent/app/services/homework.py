from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LOCAL_TZ = timezone(timedelta(hours=8))
HOMEWORK_DB_PATH = Path("E:/作业获取项目/homework_db.json")


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=LOCAL_TZ)

    return parsed.astimezone(LOCAL_TZ)


def _is_completed(item: dict[str, Any]) -> bool:
    status = str(item.get("status", "")).lower()
    return bool(
        item.get("completed")
        or item.get("done")
        or item.get("finished")
        or status in {"done", "completed", "finished", "submitted"}
    )


def read_due_homework(days: int = 2) -> dict[str, Any]:
    now = datetime.now(LOCAL_TZ)
    end = now + timedelta(days=days)

    with HOMEWORK_DB_PATH.open("r", encoding="utf-8") as file:
        raw = json.load(file)

    known_assignments = raw.get("known_assignments", {})
    assignments: list[dict[str, Any]] = []

    if not isinstance(known_assignments, dict):
        return {"windowLabel": f"{days} days", "assignments": []}

    for assignment_id, item in known_assignments.items():
        if not isinstance(item, dict) or _is_completed(item):
            continue

        deadline = _parse_datetime(item.get("deadline"))

        if deadline is None or deadline < now or deadline > end:
            continue

        assignments.append(
            {
                "id": str(assignment_id),
                "name": str(item.get("name") or "Untitled homework"),
                "course": str(item.get("course") or "Unknown course"),
                "deadline": deadline.isoformat(timespec="seconds"),
                "content": str(item.get("content") or ""),
            }
        )

    assignments.sort(key=lambda item: item["deadline"])

    return {
        "windowLabel": f"0-{days}d",
        "assignments": assignments,
    }
