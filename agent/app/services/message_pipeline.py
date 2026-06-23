from __future__ import annotations

import email
import hashlib
import imaplib
import json
import os
import re
import sqlite3
import ssl
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.headerregistry import AddressHeader
from email.message import EmailMessage
from email.policy import default
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

from app.services.cache import DATA_DIR, LOCAL_TZ, now_iso

DB_PATH = DATA_DIR / "messages.sqlite3"
MAIL_ACCOUNTS_PATH = DATA_DIR / "mail_accounts.json"

MAX_BODY_CHARS = int(os.getenv("MAIL_MAX_BODY_CHARS", "6000"))
DEFAULT_MAX_FETCH = int(os.getenv("MAIL_MAX_FETCH", "20"))
DEFAULT_SYNC_LOOKBACK_DAYS = int(os.getenv("MAIL_SYNC_LOOKBACK_DAYS", "14"))


@dataclass(frozen=True)
class MailAccount:
    id: str
    label: str
    email_address: str
    host: str
    port: int = 993
    username: str = ""
    password: str = ""
    folder: str = "INBOX"
    use_ssl: bool = True
    max_fetch: int = DEFAULT_MAX_FETCH
    web_search_url: str = ""


@dataclass(frozen=True)
class MessageItem:
    id: str
    source: str
    source_item_id: str
    account_id: str
    account_label: str
    account_email: str
    title: str
    sender: str
    received_at: str
    snippet: str
    body_text: str
    web_link: str
    raw_ref: str


def _connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def ensure_schema() -> None:
    with _connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
              id TEXT PRIMARY KEY,
              source TEXT NOT NULL,
              source_item_id TEXT NOT NULL,
              account_id TEXT NOT NULL,
              account_label TEXT NOT NULL,
              account_email TEXT NOT NULL,
              title TEXT NOT NULL,
              sender TEXT NOT NULL,
              received_at TEXT NOT NULL,
              snippet TEXT NOT NULL,
              body_hash TEXT NOT NULL,
              web_link TEXT NOT NULL,
              raw_ref TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS message_analysis (
              message_id TEXT PRIMARY KEY,
              importance TEXT NOT NULL,
              needs_attention INTEGER NOT NULL,
              category TEXT NOT NULL,
              summary TEXT NOT NULL,
              action_items TEXT NOT NULL,
              deadline TEXT,
              display_reason TEXT NOT NULL,
              notification_title TEXT NOT NULL,
              model TEXT NOT NULL,
              analyzed_at TEXT NOT NULL,
              FOREIGN KEY(message_id) REFERENCES messages(id)
            );

            CREATE TABLE IF NOT EXISTS notification_items (
              id TEXT PRIMARY KEY,
              source TEXT NOT NULL,
              source_item_id TEXT NOT NULL,
              title TEXT NOT NULL,
              summary TEXT NOT NULL,
              time TEXT NOT NULL,
              unread INTEGER NOT NULL,
              importance TEXT NOT NULL,
              account_label TEXT,
              account_email TEXT,
              web_link TEXT,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sync_state (
              source TEXT NOT NULL,
              account_id TEXT NOT NULL,
              key TEXT NOT NULL,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              PRIMARY KEY (source, account_id, key)
            );
            """
        )


def _load_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def load_mail_accounts() -> list[MailAccount]:
    raw = os.getenv("MAIL_ACCOUNTS_JSON")

    if raw:
        data = json.loads(raw)
    elif MAIL_ACCOUNTS_PATH.exists():
        data = _load_json_file(MAIL_ACCOUNTS_PATH)
    else:
        return []

    accounts: list[MailAccount] = []

    if not isinstance(data, list):
        raise ValueError("mail accounts config must be a JSON array")

    for item in data:
        if not isinstance(item, dict):
            continue

        password = item.get("password")
        password_env = item.get("passwordEnv")

        if not password and password_env:
          password = os.getenv(str(password_env), "")

        username = str(item.get("username") or item.get("email") or "")
        email_address = str(item.get("email") or username)
        account_id = str(item.get("id") or email_address or item.get("host"))

        if not account_id or not item.get("host") or not username or not password:
            continue

        accounts.append(
            MailAccount(
                id=account_id,
                label=str(item.get("label") or email_address),
                email_address=email_address,
                host=str(item["host"]),
                port=int(item.get("port") or 993),
                username=username,
                password=str(password),
                folder=str(item.get("folder") or "INBOX"),
                use_ssl=bool(item.get("useSsl", True)),
                max_fetch=int(item.get("maxFetch") or DEFAULT_MAX_FETCH),
                web_search_url=str(item.get("webSearchUrl") or ""),
            )
        )

    return accounts


def _get_sync_state(connection: sqlite3.Connection, source: str, account_id: str, key: str) -> str | None:
    row = connection.execute(
        "SELECT value FROM sync_state WHERE source = ? AND account_id = ? AND key = ?",
        (source, account_id, key),
    ).fetchone()
    return str(row["value"]) if row else None


def _set_sync_state(
    connection: sqlite3.Connection,
    source: str,
    account_id: str,
    key: str,
    value: str,
) -> None:
    connection.execute(
        """
        INSERT INTO sync_state (source, account_id, key, value, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source, account_id, key)
        DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        """,
        (source, account_id, key, value, now_iso()),
    )


def _clean_text(value: str) -> str:
    value = re.sub(r"\r\n?", "\n", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _message_text(message: EmailMessage) -> str:
    if message.is_multipart():
        chunks: list[str] = []

        for part in message.walk():
            if part.get_content_disposition() == "attachment":
                continue

            if part.get_content_type() != "text/plain":
                continue

            try:
                chunks.append(str(part.get_content()))
            except (LookupError, UnicodeDecodeError):
                continue

        if chunks:
            return _clean_text("\n\n".join(chunks))

    try:
        content = message.get_content()
    except (LookupError, UnicodeDecodeError):
        return ""

    return _clean_text(content if isinstance(content, str) else "")


def _message_sender(message: EmailMessage) -> str:
    sender = message["from"]

    if isinstance(sender, AddressHeader):
        return str(sender.addresses[0]) if sender.addresses else ""

    return str(sender or "")


def _message_received_at(message: EmailMessage) -> str:
    raw_date = message["date"]

    if not raw_date:
        return now_iso()

    try:
        parsed = parsedate_to_datetime(str(raw_date))
    except (TypeError, ValueError):
        return now_iso()

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=LOCAL_TZ)

    return parsed.astimezone(LOCAL_TZ).isoformat(timespec="seconds")


def _message_web_link(account: MailAccount, message_id: str) -> str:
    if account.web_search_url and message_id:
        return account.web_search_url.replace("{messageId}", urllib.request.quote(message_id))

    return ""


def _parse_mail_message(account: MailAccount, uidvalidity: str, uid: str, raw: bytes) -> MessageItem:
    message = email.message_from_bytes(raw, policy=default)
    assert isinstance(message, EmailMessage)

    raw_message_id = str(message["message-id"] or "").strip("<>")
    source_item_id = f"{uidvalidity}:{uid}"
    message_id = f"mail:{account.id}:{source_item_id}"
    body_text = _message_text(message)[:MAX_BODY_CHARS]
    title = str(message["subject"] or "(no subject)")

    return MessageItem(
        id=message_id,
        source="mail",
        source_item_id=source_item_id,
        account_id=account.id,
        account_label=account.label,
        account_email=account.email_address,
        title=title,
        sender=_message_sender(message),
        received_at=_message_received_at(message),
        snippet=body_text[:320],
        body_text=body_text,
        web_link=_message_web_link(account, raw_message_id),
        raw_ref=raw_message_id or source_item_id,
    )


def _save_message(connection: sqlite3.Connection, item: MessageItem) -> bool:
    body_hash = hashlib.sha256(item.body_text.encode("utf-8")).hexdigest()
    now = now_iso()
    existing = connection.execute(
        "SELECT body_hash FROM messages WHERE id = ?",
        (item.id,),
    ).fetchone()

    if existing and str(existing["body_hash"]) == body_hash:
        return False

    connection.execute(
        """
        INSERT INTO messages (
          id, source, source_item_id, account_id, account_label, account_email,
          title, sender, received_at, snippet, body_hash, web_link, raw_ref,
          created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          sender = excluded.sender,
          received_at = excluded.received_at,
          snippet = excluded.snippet,
          body_hash = excluded.body_hash,
          web_link = excluded.web_link,
          raw_ref = excluded.raw_ref,
          updated_at = excluded.updated_at
        """,
        (
            item.id,
            item.source,
            item.source_item_id,
            item.account_id,
            item.account_label,
            item.account_email,
            item.title,
            item.sender,
            item.received_at,
            item.snippet,
            body_hash,
            item.web_link,
            item.raw_ref,
            now,
            now,
        ),
    )
    return True


def collect_imap_account(account: MailAccount) -> list[MessageItem]:
    context = ssl.create_default_context()
    client: imaplib.IMAP4

    if account.use_ssl:
        client = imaplib.IMAP4_SSL(account.host, account.port, ssl_context=context)
    else:
        client = imaplib.IMAP4(account.host, account.port)

    try:
        client.login(account.username, account.password)
        status, _ = client.select(account.folder, readonly=True)

        if status != "OK":
            raise RuntimeError(f"cannot select folder {account.folder}")

        uidvalidity_values = client.response("UIDVALIDITY")[1]
        uidvalidity = str(uidvalidity_values[0], "ascii") if uidvalidity_values and uidvalidity_values[0] else "default"

        with _connect() as connection:
            ensure_schema()
            last_uid = _get_sync_state(connection, "mail", account.id, "last_uid")

        if last_uid and last_uid.isdigit():
            criteria = f"UID {int(last_uid) + 1}:*"
        else:
            since = (datetime.now(LOCAL_TZ) - timedelta(days=DEFAULT_SYNC_LOOKBACK_DAYS)).strftime("%d-%b-%Y")
            criteria = f"SINCE {since}"

        status, data = client.uid("search", None, criteria)

        if status != "OK" or not data or not data[0]:
            return []

        uids = data[0].split()[-account.max_fetch :]
        items: list[MessageItem] = []

        for uid_bytes in uids:
            uid = uid_bytes.decode("ascii")
            status, fetch_data = client.uid("fetch", uid, "(RFC822)")

            if status != "OK":
                continue

            raw_message = next(
                (
                    chunk[1]
                    for chunk in fetch_data
                    if isinstance(chunk, tuple) and isinstance(chunk[1], bytes)
                ),
                None,
            )

            if not raw_message:
                continue

            items.append(_parse_mail_message(account, uidvalidity, uid, raw_message))

        if uids:
            with _connect() as connection:
                _set_sync_state(connection, "mail", account.id, "last_uid", uids[-1].decode("ascii"))
                connection.commit()

        return items
    finally:
        try:
            client.logout()
        except imaplib.IMAP4.error:
            pass


def _fallback_analysis(item: MessageItem) -> dict[str, Any]:
    text = f"{item.title}\n{item.sender}\n{item.snippet}".lower()
    important_keywords = [
        "urgent",
        "deadline",
        "due",
        "invoice",
        "security",
        "verify",
        "作业",
        "截止",
        "通知",
        "验证码",
        "安全",
        "会议",
    ]
    low_keywords = ["unsubscribe", "newsletter", "promotion", "折扣", "促销"]
    important = any(keyword in text for keyword in important_keywords)
    low = any(keyword in text for keyword in low_keywords)

    if important:
        importance = "important"
    elif low:
        importance = "low"
    else:
        importance = "normal"

    return {
        "importance": importance,
        "needsAttention": important,
        "category": "mail",
        "summary": item.snippet or item.title,
        "actionItems": [],
        "deadline": None,
        "displayReason": "Local keyword fallback analysis.",
        "notificationTitle": item.title,
    }


def _extract_json_object(value: str) -> dict[str, Any]:
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", value, flags=re.DOTALL)

        if not match:
            return {}

        parsed = json.loads(match.group(0))
        return parsed if isinstance(parsed, dict) else {}


def analyze_message(item: MessageItem) -> dict[str, Any]:
    api_key = os.getenv("DEEPSEEK_API_KEY")

    if not api_key:
        return _fallback_analysis(item)

    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
    timeout = float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "20"))

    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You classify personal emails for a private local dashboard. "
                    "Return only JSON with keys: importance, needsAttention, category, "
                    "summary, actionItems, deadline, displayReason, notificationTitle. "
                    "importance must be one of critical, important, normal, low."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "account": item.account_email,
                        "title": item.title,
                        "sender": item.sender,
                        "receivedAt": item.received_at,
                        "snippet": item.snippet,
                        "bodyText": item.body_text,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    request = urllib.request.Request(
        f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return _fallback_analysis(item)

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    analysis = {**_fallback_analysis(item), **_extract_json_object(str(content))}
    analysis["model"] = model
    return analysis


def _save_analysis(connection: sqlite3.Connection, item: MessageItem, analysis: dict[str, Any]) -> None:
    importance = str(analysis.get("importance") or "normal").lower()
    needs_attention = bool(analysis.get("needsAttention"))
    action_items = analysis.get("actionItems")

    if not isinstance(action_items, list):
        action_items = []

    connection.execute(
        """
        INSERT INTO message_analysis (
          message_id, importance, needs_attention, category, summary,
          action_items, deadline, display_reason, notification_title,
          model, analyzed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          importance = excluded.importance,
          needs_attention = excluded.needs_attention,
          category = excluded.category,
          summary = excluded.summary,
          action_items = excluded.action_items,
          deadline = excluded.deadline,
          display_reason = excluded.display_reason,
          notification_title = excluded.notification_title,
          model = excluded.model,
          analyzed_at = excluded.analyzed_at
        """,
        (
            item.id,
            importance,
            1 if needs_attention else 0,
            str(analysis.get("category") or "mail"),
            str(analysis.get("summary") or item.snippet or item.title),
            json.dumps(action_items, ensure_ascii=False),
            analysis.get("deadline"),
            str(analysis.get("displayReason") or ""),
            str(analysis.get("notificationTitle") or item.title),
            str(analysis.get("model") or "local-fallback"),
            now_iso(),
        ),
    )

    if needs_attention or importance in {"critical", "important"}:
        connection.execute(
            """
            INSERT INTO notification_items (
              id, source, source_item_id, title, summary, time, unread,
              importance, account_label, account_email, web_link, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              title = excluded.title,
              summary = excluded.summary,
              time = excluded.time,
              importance = excluded.importance,
              account_label = excluded.account_label,
              account_email = excluded.account_email,
              web_link = excluded.web_link
            """
            ,
            (
                f"notification:{item.id}",
                "mail",
                item.id,
                str(analysis.get("notificationTitle") or item.title),
                str(analysis.get("summary") or item.snippet),
                item.received_at,
                1,
                importance,
                item.account_label,
                item.account_email,
                item.web_link,
                now_iso(),
            ),
        )


def refresh_mail() -> dict[str, Any]:
    ensure_schema()
    try:
        accounts = load_mail_accounts()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return {
            "configured": False,
            "accounts": [],
            "fetched": 0,
            "analyzed": 0,
            "errors": [f"mail config failed: {exc}"],
        }

    inserted = 0
    analyzed = 0
    errors: list[str] = []

    if not accounts:
        return {
            "configured": False,
            "accounts": [],
            "fetched": 0,
            "analyzed": 0,
            "errors": [],
        }

    for account in accounts:
        try:
            items = collect_imap_account(account)
        except (imaplib.IMAP4.error, OSError, RuntimeError, ValueError) as exc:
            errors.append(f"{account.label}: {exc}")
            continue

        with _connect() as connection:
            for item in items:
                changed = _save_message(connection, item)

                if changed:
                    inserted += 1
                    _save_analysis(connection, item, analyze_message(item))
                    analyzed += 1

            connection.commit()

    return {
        "configured": True,
        "accounts": [
            {
                "id": account.id,
                "label": account.label,
                "email": account.email_address,
            }
            for account in accounts
        ],
        "fetched": inserted,
        "analyzed": analyzed,
        "errors": errors,
    }


def mail_summary(limit: int = 12) -> dict[str, Any]:
    ensure_schema()
    config_error: str | None = None

    try:
        accounts = load_mail_accounts()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        accounts = []
        config_error = f"mail config failed: {exc}"

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT
              m.id, m.account_label, m.account_email, m.title, m.sender,
              m.received_at, m.snippet, m.web_link,
              a.importance, a.needs_attention, a.category, a.summary,
              a.action_items, a.deadline, a.display_reason, a.notification_title,
              a.analyzed_at
            FROM messages m
            LEFT JOIN message_analysis a ON a.message_id = m.id
            ORDER BY m.received_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        sync_rows = connection.execute(
            """
            SELECT account_id, MAX(updated_at) AS updated_at
            FROM sync_state
            WHERE source = 'mail'
            GROUP BY account_id
            """
        ).fetchall()

    last_sync_by_account = {
        str(row["account_id"]): str(row["updated_at"]) for row in sync_rows
    }
    important_count = sum(
        1
        for row in rows
        if row["needs_attention"] or str(row["importance"] or "") in {"critical", "important"}
    )

    return {
        "configured": bool(accounts),
        "error": config_error,
        "accounts": [
            {
                "id": account.id,
                "label": account.label,
                "email": account.email_address,
                "lastSyncAt": last_sync_by_account.get(account.id),
            }
            for account in accounts
        ],
        "importantCount": important_count,
        "items": [
            {
                "id": row["id"],
                "accountLabel": row["account_label"],
                "accountEmail": row["account_email"],
                "title": row["notification_title"] or row["title"],
                "sender": row["sender"],
                "receivedAt": row["received_at"],
                "snippet": row["snippet"],
                "summary": row["summary"] or row["snippet"],
                "importance": row["importance"] or "normal",
                "needsAttention": bool(row["needs_attention"]),
                "category": row["category"] or "mail",
                "actionItems": json.loads(row["action_items"] or "[]"),
                "deadline": row["deadline"],
                "displayReason": row["display_reason"] or "",
                "webLink": row["web_link"],
                "analyzedAt": row["analyzed_at"],
            }
            for row in rows
        ],
    }


def notification_center() -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT id, source, title, summary, time, unread, importance,
                   account_label, account_email, web_link
            FROM notification_items
            ORDER BY time DESC
            LIMIT 20
            """
        ).fetchall()

    items = [
        {
            "id": row["id"],
            "source": row["source"],
            "title": row["title"],
            "summary": row["summary"],
            "time": row["time"],
            "unread": bool(row["unread"]),
            "importance": row["importance"],
            "accountLabel": row["account_label"],
            "accountEmail": row["account_email"],
            "webLink": row["web_link"],
        }
        for row in rows
    ]

    return {
        "enabledSources": ["mail", "github", "bilibili", "school"],
        "items": items,
    }
