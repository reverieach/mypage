from __future__ import annotations

import json
import sqlite3
from typing import Any

from app.services.cache import DATA_DIR, now_iso

DB_PATH = DATA_DIR / "user_config.sqlite3"
CONFIG_ID = "current"
SCHEMA_VERSION = 1
MAX_SNAPSHOTS = 50


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_schema() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS user_config (
              id TEXT PRIMARY KEY,
              config_json TEXT NOT NULL,
              schema_version INTEGER NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS config_snapshots (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              reason TEXT NOT NULL,
              config_json TEXT NOT NULL,
              schema_version INTEGER NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )


def _decode_config(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}

    return parsed if isinstance(parsed, dict) else {}


def _current_row(connection: sqlite3.Connection) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT config_json, schema_version, updated_at FROM user_config WHERE id = ?",
        (CONFIG_ID,),
    ).fetchone()


def _insert_snapshot(
    connection: sqlite3.Connection,
    config: dict[str, Any],
    reason: str,
    schema_version: int,
) -> None:
    connection.execute(
        """
        INSERT INTO config_snapshots (reason, config_json, schema_version, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (
            reason,
            json.dumps(config, ensure_ascii=False, separators=(",", ":")),
            schema_version,
            now_iso(),
        ),
    )
    overflow_rows = connection.execute(
        """
        SELECT id FROM config_snapshots
        ORDER BY created_at DESC, id DESC
        LIMIT -1 OFFSET ?
        """,
        (MAX_SNAPSHOTS,),
    ).fetchall()

    if overflow_rows:
        connection.executemany(
            "DELETE FROM config_snapshots WHERE id = ?",
            [(row["id"],) for row in overflow_rows],
        )


def load_user_config() -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        row = _current_row(connection)
        snapshot_count = int(
            connection.execute("SELECT COUNT(*) AS count FROM config_snapshots").fetchone()[
                "count"
            ]
        )

    if not row:
        return {
            "configured": False,
            "schemaVersion": SCHEMA_VERSION,
            "updatedAt": None,
            "snapshotCount": snapshot_count,
            "config": None,
        }

    return {
        "configured": True,
        "schemaVersion": int(row["schema_version"]),
        "updatedAt": str(row["updated_at"]),
        "snapshotCount": snapshot_count,
        "config": _decode_config(str(row["config_json"])),
    }


def save_user_config(payload: dict[str, Any], reason: str = "autosave") -> dict[str, Any]:
    ensure_schema()
    config = payload.get("config") if isinstance(payload.get("config"), dict) else payload
    schema_version = int(payload.get("schemaVersion") or SCHEMA_VERSION)
    updated_at = str(payload.get("updatedAt") or now_iso())

    with _connect() as connection:
        current = _current_row(connection)

        if current:
            _insert_snapshot(
                connection,
                _decode_config(str(current["config_json"])),
                reason,
                int(current["schema_version"]),
            )

        connection.execute(
            """
            INSERT INTO user_config (id, config_json, schema_version, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              config_json = excluded.config_json,
              schema_version = excluded.schema_version,
              updated_at = excluded.updated_at
            """,
            (
                CONFIG_ID,
                json.dumps(config, ensure_ascii=False, separators=(",", ":")),
                schema_version,
                updated_at,
            ),
        )
        connection.commit()

    return load_user_config()


def list_config_snapshots(limit: int = 30) -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, reason, schema_version, created_at
            FROM config_snapshots
            ORDER BY created_at DESC, id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()

    return {
        "items": [
            {
                "id": int(row["id"]),
                "reason": str(row["reason"]),
                "schemaVersion": int(row["schema_version"]),
                "createdAt": str(row["created_at"]),
            }
            for row in rows
        ],
    }


def restore_config_snapshot(snapshot_id: int) -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        row = connection.execute(
            """
            SELECT config_json, schema_version
            FROM config_snapshots
            WHERE id = ?
            """,
            (snapshot_id,),
        ).fetchone()

        if not row:
            raise ValueError(f"config snapshot not found: {snapshot_id}")

        current = _current_row(connection)
        if current:
            _insert_snapshot(
                connection,
                _decode_config(str(current["config_json"])),
                "before-restore",
                int(current["schema_version"]),
            )

        restored_at = now_iso()
        connection.execute(
            """
            INSERT INTO user_config (id, config_json, schema_version, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              config_json = excluded.config_json,
              schema_version = excluded.schema_version,
              updated_at = excluded.updated_at
            """,
            (CONFIG_ID, str(row["config_json"]), int(row["schema_version"]), restored_at),
        )
        connection.commit()

    return load_user_config()
