from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from app.services.cache import DATA_DIR, now_iso

LOCAL_TZ = timezone(timedelta(hours=8))
WEATHER_SETTINGS_PATH = Path(
    os.getenv("WEATHER_SETTINGS_PATH", str(DATA_DIR / "weather_settings.json"))
)
WEATHER_CACHE_PATH = Path(os.getenv("WEATHER_CACHE_PATH", str(DATA_DIR / "weather_cache.json")))
OPEN_METEO_FORECAST_URL = os.getenv(
    "OPEN_METEO_FORECAST_URL",
    "https://api.open-meteo.com/v1/forecast",
)
WEATHER_CACHE_TTL_SECONDS = int(os.getenv("WEATHER_CACHE_TTL_SECONDS", str(30 * 60)))
WEATHER_TIMEOUT_SECONDS = float(os.getenv("WEATHER_TIMEOUT_SECONDS", "12"))

DEFAULT_WEATHER_SETTINGS: dict[str, Any] = {
    "provider": "open-meteo",
    "activeLocationId": "bupt",
    "locations": [
        {
            "id": "bupt",
            "label": "北邮",
            "latitude": 39.962,
            "longitude": 116.358,
            "timezone": "Asia/Shanghai",
        },
        {
            "id": "beijing",
            "label": "北京",
            "latitude": 39.9042,
            "longitude": 116.4074,
            "timezone": "Asia/Shanghai",
        },
    ],
    "alerts": {
        "rainProbability": 40,
        "lowFeelsLike": 5,
        "highFeelsLike": 32,
        "windSpeed": 30,
        "uvIndex": 6,
    },
    "cacheTtlSeconds": WEATHER_CACHE_TTL_SECONDS,
}

WEATHER_CODE_MAP: dict[int, tuple[str, str]] = {
    0: ("clear", "晴"),
    1: ("mainly-clear", "晴间多云"),
    2: ("partly-cloudy", "多云"),
    3: ("overcast", "阴"),
    45: ("fog", "雾"),
    48: ("fog", "雾凇"),
    51: ("drizzle", "小毛毛雨"),
    53: ("drizzle", "毛毛雨"),
    55: ("drizzle", "较强毛毛雨"),
    56: ("freezing-drizzle", "冻毛毛雨"),
    57: ("freezing-drizzle", "较强冻毛毛雨"),
    61: ("rain", "小雨"),
    63: ("rain", "中雨"),
    65: ("rain", "大雨"),
    66: ("freezing-rain", "冻雨"),
    67: ("freezing-rain", "强冻雨"),
    71: ("snow", "小雪"),
    73: ("snow", "中雪"),
    75: ("snow", "大雪"),
    77: ("snow", "雪粒"),
    80: ("rain-showers", "阵雨"),
    81: ("rain-showers", "较强阵雨"),
    82: ("rain-showers", "强阵雨"),
    85: ("snow-showers", "阵雪"),
    86: ("snow-showers", "强阵雪"),
    95: ("thunderstorm", "雷暴"),
    96: ("thunderstorm", "雷暴伴冰雹"),
    99: ("thunderstorm", "强雷暴伴冰雹"),
}


def _read_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}

    return raw if isinstance(raw, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None

    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=LOCAL_TZ)

    return parsed.astimezone(LOCAL_TZ)


def _weather_description(code: Any) -> tuple[str, str]:
    try:
        normalized = int(code)
    except (TypeError, ValueError):
        return "unknown", "天气未知"

    return WEATHER_CODE_MAP.get(normalized, ("unknown", "天气未知"))


def load_weather_settings() -> dict[str, Any]:
    stored = _read_json(WEATHER_SETTINGS_PATH)
    settings = {**DEFAULT_WEATHER_SETTINGS, **stored}
    default_alerts = DEFAULT_WEATHER_SETTINGS["alerts"]
    settings["alerts"] = {**default_alerts, **dict(stored.get("alerts") or {})}

    locations = stored.get("locations")
    if isinstance(locations, list) and locations:
        settings["locations"] = locations

    return settings


def save_weather_settings(payload: dict[str, Any]) -> dict[str, Any]:
    current = load_weather_settings()
    next_settings = {**current, **payload}
    _write_json(WEATHER_SETTINGS_PATH, next_settings)
    return load_weather_settings()


def _active_location(settings: dict[str, Any]) -> dict[str, Any]:
    locations = settings.get("locations")
    active_id = str(settings.get("activeLocationId") or "")

    if not isinstance(locations, list) or not locations:
        return DEFAULT_WEATHER_SETTINGS["locations"][0]

    for location in locations:
        if isinstance(location, dict) and str(location.get("id") or "") == active_id:
            return location

    first = locations[0]
    return first if isinstance(first, dict) else DEFAULT_WEATHER_SETTINGS["locations"][0]


def _is_cache_fresh(cache: dict[str, Any], ttl_seconds: int) -> bool:
    fetched_at = _parse_datetime(cache.get("fetchedAt"))

    if not fetched_at:
        return False

    return datetime.now(LOCAL_TZ) - fetched_at < timedelta(seconds=ttl_seconds)


def _build_open_meteo_url(location: dict[str, Any]) -> str:
    params = {
        "latitude": float(location.get("latitude")),
        "longitude": float(location.get("longitude")),
        "timezone": str(location.get("timezone") or "Asia/Shanghai"),
        "forecast_days": "7",
        "current": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
                "wind_gusts_10m",
                "relative_humidity_2m",
                "is_day",
            ]
        ),
        "hourly": ",".join(
            [
                "temperature_2m",
                "apparent_temperature",
                "precipitation_probability",
                "precipitation",
                "weather_code",
                "wind_speed_10m",
                "wind_gusts_10m",
                "relative_humidity_2m",
                "uv_index",
            ]
        ),
        "daily": ",".join(
            [
                "weather_code",
                "temperature_2m_max",
                "temperature_2m_min",
                "apparent_temperature_max",
                "apparent_temperature_min",
                "precipitation_probability_max",
                "precipitation_sum",
                "wind_speed_10m_max",
                "uv_index_max",
                "sunrise",
                "sunset",
            ]
        ),
    }
    return f"{OPEN_METEO_FORECAST_URL}?{urllib.parse.urlencode(params)}"


def _fetch_open_meteo(location: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        _build_open_meteo_url(location),
        headers={"User-Agent": "MyPage/0.1 personal weather widget"},
    )
    last_error: Exception | None = None

    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=WEATHER_TIMEOUT_SECONDS) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc

            if attempt < 2:
                time.sleep(0.6 * (attempt + 1))

    assert last_error is not None
    raise last_error


def _safe_list(data: dict[str, Any], group: str, key: str) -> list[Any]:
    value = data.get(group, {}).get(key)
    return value if isinstance(value, list) else []


def _current_hour_index(hourly_times: list[Any]) -> int:
    now = datetime.now(LOCAL_TZ)
    parsed_times = [_parse_datetime(value) for value in hourly_times]
    valid_indexes = [index for index, value in enumerate(parsed_times) if value and value >= now]
    return valid_indexes[0] if valid_indexes else 0


def _hourly_items(raw: dict[str, Any], start_index: int, count: int = 12) -> list[dict[str, Any]]:
    times = _safe_list(raw, "hourly", "time")
    temperatures = _safe_list(raw, "hourly", "temperature_2m")
    apparent = _safe_list(raw, "hourly", "apparent_temperature")
    probabilities = _safe_list(raw, "hourly", "precipitation_probability")
    precipitation = _safe_list(raw, "hourly", "precipitation")
    codes = _safe_list(raw, "hourly", "weather_code")
    wind = _safe_list(raw, "hourly", "wind_speed_10m")
    gusts = _safe_list(raw, "hourly", "wind_gusts_10m")
    humidity = _safe_list(raw, "hourly", "relative_humidity_2m")
    uv_index = _safe_list(raw, "hourly", "uv_index")
    items: list[dict[str, Any]] = []

    for index in range(start_index, min(len(times), start_index + count)):
        condition, label = _weather_description(codes[index] if index < len(codes) else None)
        items.append(
            {
                "time": times[index],
                "temperature": _number_at(temperatures, index),
                "apparentTemperature": _number_at(apparent, index),
                "precipitationProbability": _number_at(probabilities, index),
                "precipitation": _number_at(precipitation, index),
                "condition": condition,
                "conditionLabel": label,
                "windSpeed": _number_at(wind, index),
                "windGust": _number_at(gusts, index),
                "humidity": _number_at(humidity, index),
                "uvIndex": _number_at(uv_index, index),
            }
        )

    return items


def _daily_items(raw: dict[str, Any], count: int = 7) -> list[dict[str, Any]]:
    times = _safe_list(raw, "daily", "time")
    codes = _safe_list(raw, "daily", "weather_code")
    temp_max = _safe_list(raw, "daily", "temperature_2m_max")
    temp_min = _safe_list(raw, "daily", "temperature_2m_min")
    feels_max = _safe_list(raw, "daily", "apparent_temperature_max")
    feels_min = _safe_list(raw, "daily", "apparent_temperature_min")
    precipitation_probability = _safe_list(raw, "daily", "precipitation_probability_max")
    precipitation_sum = _safe_list(raw, "daily", "precipitation_sum")
    wind_max = _safe_list(raw, "daily", "wind_speed_10m_max")
    uv_max = _safe_list(raw, "daily", "uv_index_max")
    sunrise = _safe_list(raw, "daily", "sunrise")
    sunset = _safe_list(raw, "daily", "sunset")
    items: list[dict[str, Any]] = []

    for index in range(min(len(times), count)):
        condition, label = _weather_description(codes[index] if index < len(codes) else None)
        items.append(
            {
                "date": times[index],
                "condition": condition,
                "conditionLabel": label,
                "temperatureMax": _number_at(temp_max, index),
                "temperatureMin": _number_at(temp_min, index),
                "apparentTemperatureMax": _number_at(feels_max, index),
                "apparentTemperatureMin": _number_at(feels_min, index),
                "precipitationProbabilityMax": _number_at(precipitation_probability, index),
                "precipitationSum": _number_at(precipitation_sum, index),
                "windSpeedMax": _number_at(wind_max, index),
                "uvIndexMax": _number_at(uv_max, index),
                "sunrise": sunrise[index] if index < len(sunrise) else None,
                "sunset": sunset[index] if index < len(sunset) else None,
            }
        )

    return items


def _number_at(values: list[Any], index: int) -> float | None:
    if index >= len(values):
        return None

    value = values[index]

    return float(value) if isinstance(value, (int, float)) else None


def _current_conditions(raw: dict[str, Any], hourly: list[dict[str, Any]]) -> dict[str, Any]:
    current = raw.get("current") if isinstance(raw.get("current"), dict) else {}
    code = current.get("weather_code")
    condition, label = _weather_description(code)

    fallback = hourly[0] if hourly else {}

    return {
        "time": current.get("time") or fallback.get("time"),
        "temperature": _coerce_number(current.get("temperature_2m"), fallback.get("temperature")),
        "apparentTemperature": _coerce_number(
            current.get("apparent_temperature"),
            fallback.get("apparentTemperature"),
        ),
        "condition": condition if condition != "unknown" else fallback.get("condition", "unknown"),
        "conditionLabel": label if condition != "unknown" else fallback.get("conditionLabel", label),
        "precipitation": _coerce_number(current.get("precipitation"), fallback.get("precipitation")),
        "windSpeed": _coerce_number(current.get("wind_speed_10m"), fallback.get("windSpeed")),
        "windGust": _coerce_number(current.get("wind_gusts_10m"), fallback.get("windGust")),
        "humidity": _coerce_number(current.get("relative_humidity_2m"), fallback.get("humidity")),
        "isDay": bool(current.get("is_day", True)),
    }


def _coerce_number(value: Any, fallback: Any = None) -> float | None:
    candidate = value if value is not None else fallback
    return float(candidate) if isinstance(candidate, (int, float)) else None


def _advice(
    current: dict[str, Any],
    hourly: list[dict[str, Any]],
    daily: list[dict[str, Any]],
    alerts: dict[str, Any],
) -> tuple[str, list[dict[str, Any]]]:
    next_six_hours = hourly[:6]
    rain_threshold = float(alerts.get("rainProbability") or 40)
    low_threshold = float(alerts.get("lowFeelsLike") or 5)
    high_threshold = float(alerts.get("highFeelsLike") or 32)
    wind_threshold = float(alerts.get("windSpeed") or 30)
    uv_threshold = float(alerts.get("uvIndex") or 6)
    suggestions: list[dict[str, Any]] = []

    max_rain = max(
        [item.get("precipitationProbability") or 0 for item in next_six_hours],
        default=0,
    )
    max_wind = max([item.get("windGust") or item.get("windSpeed") or 0 for item in next_six_hours], default=0)
    max_uv = max([item.get("uvIndex") or 0 for item in next_six_hours], default=0)
    feels_like = current.get("apparentTemperature")

    if max_rain >= rain_threshold:
        suggestions.append(
            {
                "level": "warning",
                "kind": "rain",
                "message": f"未来 6 小时降雨概率最高 {round(max_rain)}%，出门带伞。",
            }
        )

    if isinstance(feels_like, (int, float)) and feels_like <= low_threshold:
        suggestions.append(
            {
                "level": "warning",
                "kind": "cold",
                "message": f"体感约 {round(feels_like)}°C，出门加衣。",
            }
        )

    if isinstance(feels_like, (int, float)) and feels_like >= high_threshold:
        suggestions.append(
            {
                "level": "warning",
                "kind": "hot",
                "message": f"体感约 {round(feels_like)}°C，注意防暑补水。",
            }
        )

    if max_wind >= wind_threshold:
        suggestions.append(
            {
                "level": "notice",
                "kind": "wind",
                "message": f"阵风最高约 {round(max_wind)} km/h，骑车注意风。",
            }
        )

    if max_uv >= uv_threshold:
        suggestions.append(
            {
                "level": "notice",
                "kind": "uv",
                "message": f"紫外线最高约 {round(max_uv, 1)}，午间注意防晒。",
            }
        )

    if not suggestions:
        today = daily[0] if daily else {}
        summary = (
            f"今天 {today.get('conditionLabel') or current.get('conditionLabel') or '天气平稳'}，"
            "通勤天气正常。"
        )
    else:
        summary = suggestions[0]["message"]

    return summary, suggestions


def _normalize_weather(raw: dict[str, Any], settings: dict[str, Any]) -> dict[str, Any]:
    location = _active_location(settings)
    hourly_times = _safe_list(raw, "hourly", "time")
    start_index = _current_hour_index(hourly_times)
    hourly = _hourly_items(raw, start_index, count=12)
    daily = _daily_items(raw, count=7)
    current = _current_conditions(raw, hourly)
    summary, suggestions = _advice(current, hourly, daily, settings.get("alerts") or {})

    return {
        "provider": "open-meteo",
        "location": {
            "id": str(location.get("id") or "beijing"),
            "label": str(location.get("label") or "北京"),
            "latitude": float(location.get("latitude") or 39.9042),
            "longitude": float(location.get("longitude") or 116.4074),
            "timezone": str(location.get("timezone") or "Asia/Shanghai"),
        },
        "current": current,
        "hourly": hourly,
        "daily": daily,
        "summary": summary,
        "suggestions": suggestions,
        "units": {
            "temperature": "°C",
            "windSpeed": "km/h",
            "precipitation": "mm",
            "precipitationProbability": "%",
        },
        "lastRefreshAt": now_iso(),
        "nextRefreshAt": (
            datetime.now(LOCAL_TZ) + timedelta(seconds=WEATHER_CACHE_TTL_SECONDS)
        ).isoformat(),
        "sourceUrl": "https://open-meteo.com/",
    }


def read_weather_summary(*, force_refresh: bool = False) -> dict[str, Any]:
    settings = load_weather_settings()
    ttl_seconds = int(settings.get("cacheTtlSeconds") or WEATHER_CACHE_TTL_SECONDS)
    cache = _read_json(WEATHER_CACHE_PATH)

    if not force_refresh and cache.get("data") and _is_cache_fresh(cache, ttl_seconds):
        data = dict(cache["data"])
        data["fromCache"] = True
        return data

    try:
        location = _active_location(settings)
        raw = _fetch_open_meteo(location)
        data = _normalize_weather(raw, settings)
        data["fromCache"] = False
        _write_json(
            WEATHER_CACHE_PATH,
            {
                "schemaVersion": 1,
                "fetchedAt": data["lastRefreshAt"],
                "lastError": None,
                "data": data,
            },
        )
        return data
    except Exception as exc:
        if cache.get("data"):
            data = dict(cache["data"])
            data["fromCache"] = True
            data["lastError"] = str(exc)
            return data

        raise


def refresh_weather_summary() -> dict[str, Any]:
    return read_weather_summary(force_refresh=True)
