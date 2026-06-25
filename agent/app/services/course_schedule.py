from __future__ import annotations

import json
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from app.services.cache import DATA_DIR

LOCAL_TZ = timezone(timedelta(hours=8))
COURSE_SCHEDULE_PATH = Path(
    os.getenv("COURSE_SCHEDULE_PATH", str(DATA_DIR / "course_schedule.json"))
)
WEEKDAY_LABELS = {
    1: "星期一",
    2: "星期二",
    3: "星期三",
    4: "星期四",
    5: "星期五",
    6: "星期六",
    7: "星期日",
}


def _read_schedule() -> dict[str, Any]:
    if not COURSE_SCHEDULE_PATH.exists():
        return {}

    try:
        raw = json.loads(COURSE_SCHEDULE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    return raw if isinstance(raw, dict) else {}


def _parse_date(value: Any) -> date | None:
    if not value:
        return None

    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


def _parse_time(value: Any) -> time | None:
    if not value:
        return None

    try:
        return datetime.strptime(str(value), "%H:%M").time()
    except ValueError:
        return None


def _week_number(today: date, start_date: date | None) -> int | None:
    if not start_date:
        return None

    delta_days = (today - start_date).days

    if delta_days < 0:
        return 0

    return delta_days // 7 + 1


def _course_with_status(course: dict[str, Any], now: datetime) -> dict[str, Any]:
    start = _parse_time(course.get("start"))
    end = _parse_time(course.get("end"))
    status = "upcoming"

    if start and end:
        start_at = datetime.combine(now.date(), start, tzinfo=LOCAL_TZ)
        end_at = datetime.combine(now.date(), end, tzinfo=LOCAL_TZ)

        if now > end_at:
            status = "finished"
        elif start_at <= now <= end_at:
            status = "current"

    return {
        "id": str(course.get("id") or ""),
        "name": str(course.get("name") or ""),
        "teacher": str(course.get("teacher") or ""),
        "location": str(course.get("location") or ""),
        "weekday": int(course.get("weekday") or 0),
        "weeks": course.get("weeks") if isinstance(course.get("weeks"), list) else [],
        "sections": course.get("sections") if isinstance(course.get("sections"), list) else [],
        "start": course.get("start"),
        "end": course.get("end"),
        "status": status,
    }


def _time_key(course: dict[str, Any]) -> tuple[str, str]:
    return (str(course.get("start") or "99:99"), str(course.get("name") or ""))


def _next_upcoming(courses: list[dict[str, Any]]) -> dict[str, Any] | None:
    for course in sorted(courses, key=_time_key):
        if course.get("status") == "upcoming":
            return course

    return None


def _current_course(courses: list[dict[str, Any]]) -> dict[str, Any] | None:
    for course in courses:
        if course.get("status") == "current":
            return course

    return None


def _day_status(courses: list[dict[str, Any]]) -> str:
    if not courses:
        return "no-class"

    if _current_course(courses):
        return "in-class"

    if _next_upcoming(courses):
        return "before-class"

    return "after-class"


def read_school_today() -> dict[str, Any]:
    schedule = _read_schedule()
    now = datetime.now(LOCAL_TZ)
    today = now.date()
    weekday = today.weekday() + 1

    term = schedule.get("term") if isinstance(schedule.get("term"), dict) else {}
    start_date = _parse_date(term.get("startDate"))
    week_number = _week_number(today, start_date)
    max_week = int(term.get("maxWeek") or 0)
    courses = schedule.get("courses") if isinstance(schedule.get("courses"), list) else []

    today_courses = []

    for course in courses:
        if not isinstance(course, dict):
            continue

        weeks = course.get("weeks") if isinstance(course.get("weeks"), list) else []

        if int(course.get("weekday") or 0) != weekday:
            continue

        if week_number is not None and week_number not in weeks:
            continue

        today_courses.append(_course_with_status(course, now))

    today_courses = sorted(today_courses, key=_time_key)
    current_course = _current_course(today_courses)
    next_course = _next_upcoming(today_courses)
    configured = bool(courses)

    return {
        "configured": configured,
        "date": today.isoformat(),
        "weekday": weekday,
        "weekdayLabel": WEEKDAY_LABELS.get(weekday, ""),
        "weekNumber": week_number,
        "term": {
            "name": str(term.get("name") or ""),
            "startDate": term.get("startDate"),
            "maxWeek": max_week or None,
        },
        "dayStatus": _day_status(today_courses),
        "courses": today_courses,
        "currentCourse": current_course,
        "nextCourse": next_course,
        "notices": [],
        "source": "local-course-schedule" if configured else "missing-course-schedule",
    }
