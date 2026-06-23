from __future__ import annotations

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
LOCAL_TZ = timezone(timedelta(hours=8))


def now_iso() -> str:
    return datetime.now(LOCAL_TZ).isoformat(timespec="seconds")


def envelope(data: dict[str, Any], stale: bool = False, error: str | None = None) -> dict[str, Any]:
    return {
        "updatedAt": now_iso(),
        "stale": stale,
        "error": error,
        "data": data,
    }


def read_cached_or_sample(file_name: str, sample_data: dict[str, Any]) -> dict[str, Any]:
    cache_path = DATA_DIR / file_name

    if not cache_path.exists():
        return envelope(sample_data, stale=False)

    try:
        with cache_path.open("r", encoding="utf-8") as file:
            cached = json.load(file)
    except (OSError, json.JSONDecodeError) as exc:
        return envelope(sample_data, stale=True, error=f"cache read failed: {exc}")

    if isinstance(cached, dict) and {"updatedAt", "stale", "error", "data"} <= cached.keys():
        return cached

    if isinstance(cached, dict):
        return envelope(cached, stale=False)

    return envelope(sample_data, stale=True, error="cache data must be a JSON object")
