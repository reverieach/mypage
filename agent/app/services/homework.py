from __future__ import annotations

import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LOCAL_TZ = timezone(timedelta(hours=8))
HOMEWORK_PROJECT_DIR = Path(os.getenv("HOMEWORK_PROJECT_DIR", "E:/作业获取项目"))
HOMEWORK_DB_PATH = HOMEWORK_PROJECT_DIR / "homework_db.json"
HOMEWORK_REFRESH_TIMEOUT_SECONDS = int(os.getenv("HOMEWORK_REFRESH_TIMEOUT_SECONDS", "180"))
SILENT_HOMEWORK_REFRESH_SCRIPT = r"""
from datetime import datetime, timedelta, timezone
from dataclasses import replace

from capture_headers import capture_valid_headers
from config import load_settings
from monitor_core import (
    AuthExpiredError,
    _assignment_id,
    _inject_course_names,
    analyze_assignments,
    enrich_homework_content,
    fetch_course_map,
    fetch_undone_list,
    load_state,
    save_state,
)

LOCAL_TZ = timezone(timedelta(hours=8))


def _parse_deadline(value):
    if not isinstance(value, str) or not value:
        return None

    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=LOCAL_TZ)

    return parsed.astimezone(LOCAL_TZ)


def _is_completed(info):
    status = str(info.get("status", "")).lower()
    return bool(
        info.get("completed")
        or info.get("done")
        or info.get("finished")
        or status in {"done", "completed", "finished", "submitted"}
    )


def mark_missing_undone_as_completed(undone_list, state):
    current_ids = {
        aid
        for aid in (_assignment_id(item) for item in undone_list)
        if aid
    }
    now = datetime.now(LOCAL_TZ)
    completed_count = 0

    for aid, info in state.known_assignments.items():
        if aid in current_ids or not isinstance(info, dict) or _is_completed(info):
            continue

        deadline = _parse_deadline(info.get("deadline"))

        if deadline is None or deadline < now:
            continue

        info["completed"] = True
        info["status"] = "completed"
        info["completed_at"] = now.isoformat(timespec="seconds")
        info["completion_source"] = "missing-from-undone-list"
        completed_count += 1

    return completed_count


def run_once():
    settings = replace(
        load_settings(),
        enable_console_notify=False,
        notify_channels=(),
    )
    state = load_state(settings.state_file)

    try:
        course_map = fetch_course_map(settings)
    except Exception as exc:
        print(f"[warn] course map fetch failed, continuing without: {exc}")
        course_map = {}

    undone_list = fetch_undone_list(settings)

    if course_map:
        _inject_course_names(undone_list, course_map)

    try:
        enrich_homework_content(settings, undone_list)
    except Exception as exc:
        print(f"[warn] homework content fetch failed, continuing without: {exc}")

    events = analyze_assignments(undone_list, state, settings)
    completed_count = mark_missing_undone_as_completed(undone_list, state)
    save_state(settings.state_file, state)
    return events, completed_count


try:
    events, completed_count = run_once()
except AuthExpiredError:
    print("[warn] auth expired, refreshing headers once...")
    capture_valid_headers()
    events, completed_count = run_once()

print(f"[ok] homework data refreshed; suppressed {len(events)} notification event(s).")
print(f"[ok] marked {completed_count} assignment(s) completed from latest undone list.")
"""


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


def refresh_due_homework(days: int = 3) -> dict[str, Any]:
    env = os.environ.copy()
    env["PYTHONUTF8"] = "1"
    env.setdefault("PYTHONIOENCODING", "utf-8")

    try:
        result = subprocess.run(
            ["python", "-c", SILENT_HOMEWORK_REFRESH_SCRIPT],
            cwd=HOMEWORK_PROJECT_DIR,
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=HOMEWORK_REFRESH_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise TimeoutError(
            f"homework refresh exceeded {HOMEWORK_REFRESH_TIMEOUT_SECONDS}s"
        ) from exc

    if result.returncode != 0:
        output = "\n".join(
            part.strip()
            for part in (result.stdout, result.stderr)
            if part.strip()
        )
        raise RuntimeError(
            f"homework refresh failed with exit code {result.returncode}: {output[-600:]}"
        )

    data = read_due_homework(days=days)
    data["refreshed"] = True
    return data
