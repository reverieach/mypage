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
import urllib.parse
import urllib.request
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta
from email.headerregistry import AddressHeader
from email.message import EmailMessage
from email.policy import default
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any, Iterator

from app.services.cache import DATA_DIR, LOCAL_TZ, now_iso

DB_PATH = DATA_DIR / "messages.sqlite3"
MAIL_ACCOUNTS_PATH = DATA_DIR / "mail_accounts.json"
OAUTH_TOKENS_PATH = DATA_DIR / "oauth_tokens.json"

MAX_BODY_CHARS = int(os.getenv("MAIL_MAX_BODY_CHARS", "6000"))
DEFAULT_MAX_FETCH = int(os.getenv("MAIL_MAX_FETCH", "20"))
DEFAULT_MAX_UNREAD_FETCH = int(os.getenv("MAIL_MAX_UNREAD_FETCH", "100"))
DEFAULT_SYNC_LOOKBACK_DAYS = int(os.getenv("MAIL_SYNC_LOOKBACK_DAYS", "14"))
HOMEWORK_MONITOR_PREFIX = "[Homework Monitor]"
LOW_SIGNAL_CATEGORIES = {"shopping", "promotion", "newsletter", "spam", "marketing"}
ANALYSIS_POLICY_VERSION = 1
MARKETING_ACTIONS = {"keep", "trash"}
MICROSOFT_GRAPH_SCOPES = "offline_access User.Read Mail.ReadWrite"
MAIL_VISIBLE_FILTER_SQL = """
    NOT (
      LOWER(m.account_email) LIKE '%@qq.com'
      AND m.title LIKE '[Homework Monitor]%'
    )
    AND COALESCE(m.is_read, 0) = 0
    AND d.message_id IS NULL
    AND NOT (
      COALESCE(a.needs_attention, 0) = 0
      AND (
        LOWER(COALESCE(a.importance, 'normal')) = 'low'
        OR LOWER(COALESCE(a.category, 'mail')) IN (
          'shopping',
          'promotion',
          'newsletter',
          'spam',
          'marketing'
        )
      )
    )
    AND NOT (
      COALESCE(a.needs_attention, 0) = 0
      AND (
        LOWER(m.sender) LIKE '%amazon%'
        OR LOWER(m.sender) LIKE '%store-news%'
        OR LOWER(m.title) LIKE '%(ad)%'
        OR LOWER(m.title) LIKE '%newsletter%'
        OR LOWER(m.title) LIKE '%promotion%'
        OR LOWER(m.title) LIKE '%discount%'
        OR LOWER(m.title) LIKE '%deal%'
        OR LOWER(m.snippet) LIKE '%unsubscribe%'
        OR LOWER(m.snippet) LIKE '%amazon.cn%'
        OR m.title LIKE '%促销%'
        OR m.title LIKE '%折扣%'
        OR m.title LIKE '%优惠%'
        OR m.title LIKE '%推荐%'
        OR m.title LIKE '%限时%'
        OR m.title LIKE '%免邮%'
        OR m.title LIKE '%镇店之宝%'
        OR m.title LIKE '%热卖%'
        OR m.title LIKE '%特价%'
        OR m.title LIKE '%好价%'
        OR m.snippet LIKE '%促销%'
        OR m.snippet LIKE '%折扣%'
        OR m.snippet LIKE '%优惠%'
        OR m.snippet LIKE '%限时%'
        OR m.snippet LIKE '%免邮%'
        OR m.snippet LIKE '%镇店之宝%'
      )
    )
"""
@dataclass(frozen=True)
class MailAccount:
    id: str
    label: str
    email_address: str
    host: str
    provider: str = "imap"
    port: int = 993
    username: str = ""
    password: str = ""
    folder: str = "INBOX"
    use_ssl: bool = True
    max_fetch: int = DEFAULT_MAX_FETCH
    max_unread_fetch: int = DEFAULT_MAX_UNREAD_FETCH
    web_search_url: str = ""
    client_id: str = ""
    tenant: str = "consumers"
    marketing_action: str = "keep"
    trash_folder: str = ""


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
    is_read: bool


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
              is_read INTEGER NOT NULL DEFAULT 0,
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

            CREATE TABLE IF NOT EXISTS dismissed_messages (
              message_id TEXT PRIMARY KEY,
              dismissed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS mail_actions (
              message_id TEXT NOT NULL,
              action TEXT NOT NULL,
              status TEXT NOT NULL,
              reason TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0,
              last_error TEXT,
              attempted_at TEXT NOT NULL,
              completed_at TEXT,
              PRIMARY KEY (message_id, action)
            );
            """
        )
        _ensure_column(
            connection,
            "messages",
            "is_read",
            "INTEGER NOT NULL DEFAULT 0",
        )
        _ensure_column(
            connection,
            "message_analysis",
            "policy_version",
            "INTEGER NOT NULL DEFAULT 0",
        )
        connection.execute(
            """
            UPDATE notification_items
            SET title = (
              SELECT m.title FROM messages m
              WHERE m.id = notification_items.source_item_id
            )
            WHERE source = 'mail'
              AND EXISTS (
                SELECT 1 FROM messages m
                WHERE m.id = notification_items.source_item_id
              )
            """
        )


def _ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    definition: str,
) -> None:
    columns = {
        str(row["name"])
        for row in connection.execute(f"PRAGMA table_info({table_name})")
    }

    if column_name not in columns:
        connection.execute(
            f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}"
        )


def _load_json_file(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def _read_json_dict(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}

    data = _load_json_file(path)
    return data if isinstance(data, dict) else {}


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)


def _post_form(url: str, data: dict[str, str], timeout: float = 20) -> dict[str, Any]:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        parsed = json.loads(response.read().decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}


def _graph_json_request(
    url: str,
    token: str,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    timeout: float = 20,
) -> dict[str, Any]:
    encoded_body = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if encoded_body is not None:
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(
        url,
        data=encoded_body,
        headers=headers,
        method=method,
    )

    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = response.read()
        if not payload:
            return {}
        parsed = json.loads(payload.decode("utf-8"))
        return parsed if isinstance(parsed, dict) else {}


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

        if item.get("enabled") is False:
            continue

        provider = str(item.get("provider") or "imap")
        marketing_action = str(item.get("marketingAction") or "keep").lower()
        if marketing_action not in MARKETING_ACTIONS:
            marketing_action = "keep"

        password = item.get("password")
        password_env = item.get("passwordEnv")

        if not password and password_env:
          password = os.getenv(str(password_env), "")

        username = str(item.get("username") or item.get("email") or "")
        email_address = str(item.get("email") or username)
        account_id = str(item.get("id") or email_address or item.get("host"))
        client_id = str(
            item.get("clientId")
            or os.getenv(str(item.get("clientIdEnv") or "MICROSOFT_GRAPH_CLIENT_ID"), "")
        )

        if provider == "microsoft_graph":
            if not account_id or not email_address or not client_id:
                continue

            accounts.append(
                MailAccount(
                    id=account_id,
                    label=str(item.get("label") or email_address),
                    email_address=email_address,
                    host="graph.microsoft.com",
                    provider=provider,
                    max_fetch=int(item.get("maxFetch") or DEFAULT_MAX_FETCH),
                    max_unread_fetch=int(
                        item.get("maxUnreadFetch") or DEFAULT_MAX_UNREAD_FETCH
                    ),
                    client_id=client_id,
                    tenant=str(item.get("tenant") or "consumers"),
                    marketing_action=marketing_action,
                )
            )
            continue

        if not account_id or not item.get("host") or not username or not password:
            continue

        accounts.append(
            MailAccount(
                id=account_id,
                label=str(item.get("label") or email_address),
                email_address=email_address,
                host=str(item["host"]),
                provider=provider,
                port=int(item.get("port") or 993),
                username=username,
                password=str(password),
                folder=str(item.get("folder") or "INBOX"),
                use_ssl=bool(item.get("useSsl", True)),
                max_fetch=int(item.get("maxFetch") or DEFAULT_MAX_FETCH),
                max_unread_fetch=int(
                    item.get("maxUnreadFetch") or DEFAULT_MAX_UNREAD_FETCH
                ),
                web_search_url=str(item.get("webSearchUrl") or ""),
                marketing_action=marketing_action,
                trash_folder=str(item.get("trashFolder") or ""),
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


def _is_seen_fetch(fetch_data: list[Any]) -> bool:
    header_text = " ".join(
        chunk[0].decode("utf-8", errors="ignore")
        for chunk in fetch_data
        if isinstance(chunk, tuple) and isinstance(chunk[0], bytes)
    )
    return "\\Seen" in header_text


def _parse_graph_time(value: str) -> str:
    if not value:
        return now_iso()

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return now_iso()

    return parsed.astimezone(LOCAL_TZ).isoformat(timespec="seconds")


def _parse_mail_message(
    account: MailAccount,
    uidvalidity: str,
    uid: str,
    raw: bytes,
    is_read: bool = False,
) -> MessageItem:
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
        is_read=is_read,
    )


def _is_homework_delivery_message(item: MessageItem) -> bool:
    return (
        item.account_email.lower().endswith("@qq.com")
        and item.title.startswith(HOMEWORK_MONITOR_PREFIX)
    )


def _save_message(connection: sqlite3.Connection, item: MessageItem) -> bool:
    body_hash = hashlib.sha256(item.body_text.encode("utf-8")).hexdigest()
    now = now_iso()
    existing = connection.execute(
        "SELECT body_hash, is_read FROM messages WHERE id = ?",
        (item.id,),
    ).fetchone()
    is_read_value = 1 if item.is_read else 0

    if (
        existing
        and str(existing["body_hash"]) == body_hash
        and int(existing["is_read"] or 0) == is_read_value
    ):
        return False

    connection.execute(
        """
        INSERT INTO messages (
          id, source, source_item_id, account_id, account_label, account_email,
          title, sender, received_at, snippet, body_hash, web_link, raw_ref,
          is_read, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          account_id = excluded.account_id,
          account_label = excluded.account_label,
          account_email = excluded.account_email,
          title = excluded.title,
          sender = excluded.sender,
          received_at = excluded.received_at,
          snippet = excluded.snippet,
          body_hash = excluded.body_hash,
          web_link = excluded.web_link,
          raw_ref = excluded.raw_ref,
          is_read = excluded.is_read,
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
            is_read_value,
            now,
            now,
        ),
    )
    return not existing or str(existing["body_hash"]) != body_hash


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
            local_unread_rows = connection.execute(
                """
                SELECT source_item_id
                FROM messages
                WHERE id LIKE ? AND is_read = 0
                ORDER BY received_at DESC
                LIMIT ?
                """,
                (
                    f"mail:{account.id}:{uidvalidity}:%",
                    account.max_unread_fetch,
                ),
            ).fetchall()

        if last_uid and last_uid.isdigit():
            sync_window = max(account.max_fetch * 2, 50)
            criteria = f"UID {max(1, int(last_uid) - sync_window)}:*"
        else:
            since = (datetime.now(LOCAL_TZ) - timedelta(days=DEFAULT_SYNC_LOOKBACK_DAYS)).strftime("%d-%b-%Y")
            criteria = f"SINCE {since}"

        status, recent_data = client.uid("search", None, criteria)
        if status != "OK":
            raise RuntimeError("cannot search recent IMAP messages")

        unseen_status, unseen_data = client.uid("search", None, "UNSEEN")
        if unseen_status != "OK":
            raise RuntimeError("cannot search unread IMAP messages")

        recent_uids = recent_data[0].split()[-account.max_fetch :] if recent_data and recent_data[0] else []
        unseen_uids = unseen_data[0].split()[-account.max_unread_fetch :] if unseen_data and unseen_data[0] else []
        local_unread_uids = [
            str(row["source_item_id"]).rsplit(":", 1)[-1].encode("ascii")
            for row in local_unread_rows
            if str(row["source_item_id"]).rsplit(":", 1)[-1].isdigit()
        ]
        uids = sorted(
            set(recent_uids + unseen_uids + local_unread_uids),
            key=lambda value: int(value),
        )
        items: list[MessageItem] = []

        for uid_bytes in uids:
            uid = uid_bytes.decode("ascii")
            status, fetch_data = client.uid("fetch", uid, "(FLAGS RFC822)")

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

            item = _parse_mail_message(
                account,
                uidvalidity,
                uid,
                raw_message,
                is_read=_is_seen_fetch(fetch_data),
            )

            if _is_homework_delivery_message(item):
                continue

            items.append(item)

        if uids:
            with _connect() as connection:
                latest_uid = max(int(value) for value in uids)
                _set_sync_state(connection, "mail", account.id, "last_uid", str(latest_uid))
                connection.commit()

        return items
    finally:
        try:
            client.logout()
        except imaplib.IMAP4.error:
            pass


def _token_url(account: MailAccount) -> str:
    return f"https://login.microsoftonline.com/{account.tenant}/oauth2/v2.0/token"


def _device_code_url(account: MailAccount) -> str:
    return f"https://login.microsoftonline.com/{account.tenant}/oauth2/v2.0/devicecode"


def _graph_scopes() -> str:
    return MICROSOFT_GRAPH_SCOPES


def _load_oauth_tokens() -> dict[str, Any]:
    return _read_json_dict(OAUTH_TOKENS_PATH)


def _save_oauth_token(account_id: str, token: dict[str, Any]) -> None:
    tokens = _load_oauth_tokens()
    tokens[account_id] = {
        **tokens.get(account_id, {}),
        **token,
        "savedAt": now_iso(),
    }
    _write_json(OAUTH_TOKENS_PATH, tokens)


def _get_oauth_token(account_id: str) -> dict[str, Any] | None:
    token = _load_oauth_tokens().get(account_id)
    return token if isinstance(token, dict) else None


def _valid_cached_access_token(token: dict[str, Any]) -> str | None:
    access_token = str(token.get("access_token") or "")
    saved_at = str(token.get("savedAt") or "")
    if not access_token or not saved_at:
        return None

    try:
        saved = datetime.fromisoformat(saved_at)
        expires_in = int(token.get("expires_in") or 0)
    except (TypeError, ValueError):
        return None

    if saved.tzinfo is None:
        saved = saved.replace(tzinfo=LOCAL_TZ)
    expires_at = saved + timedelta(seconds=max(0, expires_in - 120))
    return access_token if datetime.now(LOCAL_TZ) < expires_at else None


def microsoft_graph_accounts() -> list[MailAccount]:
    return [account for account in load_mail_accounts() if account.provider == "microsoft_graph"]


def start_microsoft_device_auth(account_id: str | None = None) -> dict[str, Any]:
    accounts = microsoft_graph_accounts()

    if account_id:
        accounts = [account for account in accounts if account.id == account_id]

    if not accounts:
        return {
            "configured": False,
            "error": "No microsoft_graph account with MICROSOFT_GRAPH_CLIENT_ID configured.",
        }

    account = accounts[0]
    response = _post_form(
        _device_code_url(account),
        {
            "client_id": account.client_id,
            "scope": _graph_scopes(),
        },
    )

    return {
        "configured": True,
        "accountId": account.id,
        "userCode": response.get("user_code"),
        "deviceCode": response.get("device_code"),
        "verificationUri": response.get("verification_uri"),
        "expiresIn": response.get("expires_in"),
        "interval": response.get("interval"),
        "message": response.get("message"),
    }


def poll_microsoft_device_auth(account_id: str, device_code: str) -> dict[str, Any]:
    account = next(
        (item for item in microsoft_graph_accounts() if item.id == account_id),
        None,
    )

    if not account:
        return {"authorized": False, "error": "Unknown Microsoft Graph account."}

    try:
        token = _post_form(
            _token_url(account),
            {
                "client_id": account.client_id,
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device_code,
            },
        )
    except urllib.error.HTTPError as exc:
        try:
            error_data = json.loads(exc.read().decode("utf-8"))
        except json.JSONDecodeError:
            error_data = {"error": exc.reason}

        return {
            "authorized": False,
            "error": error_data.get("error"),
            "errorDescription": error_data.get("error_description"),
        }

    _save_oauth_token(account.id, token)

    return {
        "authorized": True,
        "accountId": account.id,
        "expiresIn": token.get("expires_in"),
    }


def refresh_microsoft_token(account: MailAccount) -> str | None:
    token = _get_oauth_token(account.id)

    if not token:
        return None

    cached_access_token = _valid_cached_access_token(token)
    if cached_access_token:
        return cached_access_token

    refresh_token = token.get("refresh_token")

    if not refresh_token:
        return None

    try:
        refreshed = _post_form(
            _token_url(account),
            {
                "client_id": account.client_id,
                "grant_type": "refresh_token",
                "refresh_token": str(refresh_token),
                "scope": _graph_scopes(),
            },
        )
    except urllib.error.HTTPError:
        return None

    _save_oauth_token(account.id, refreshed)
    return str(refreshed.get("access_token") or token.get("access_token") or "") or None


def microsoft_auth_status() -> dict[str, Any]:
    try:
        accounts = microsoft_graph_accounts()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        return {"configured": False, "error": f"mail config failed: {exc}", "accounts": []}

    tokens = _load_oauth_tokens()

    return {
        "configured": bool(accounts),
        "accounts": [
            {
                "id": account.id,
                "label": account.label,
                "email": account.email_address,
                "authorized": account.id in tokens,
                "tenant": account.tenant,
            }
            for account in accounts
        ],
    }


GRAPH_MESSAGE_FIELDS = (
    "id,subject,from,receivedDateTime,bodyPreview,webLink,isRead,internetMessageId"
)


def _graph_message_pages(
    url: str,
    token: str,
    limit: int,
) -> tuple[list[dict[str, Any]], bool]:
    messages: list[dict[str, Any]] = []
    next_url: str | None = url

    while next_url and len(messages) < limit:
        response = _graph_json_request(next_url, token)
        values = response.get("value", [])
        if isinstance(values, list):
            messages.extend(value for value in values if isinstance(value, dict))
        next_link = response.get("@odata.nextLink")
        next_url = str(next_link) if next_link else None

    return messages[:limit], next_url is None


def _graph_message_item(account: MailAccount, message: dict[str, Any]) -> MessageItem | None:
    graph_id = str(message.get("id") or "")
    if not graph_id:
        return None

    sender_data = message.get("from", {}).get("emailAddress", {})
    sender_address = str(sender_data.get("address") or "")
    sender_name = str(sender_data.get("name") or "")
    sender = (
        f"{sender_name} <{sender_address}>"
        if sender_name and sender_address
        else sender_address or sender_name
    )
    body_preview = str(message.get("bodyPreview") or "")
    internet_message_id = str(message.get("internetMessageId") or "").strip("<>")
    return MessageItem(
        id=f"mail:{account.id}:{graph_id}",
        source="mail",
        source_item_id=graph_id,
        account_id=account.id,
        account_label=account.label,
        account_email=account.email_address,
        title=str(message.get("subject") or "(no subject)"),
        sender=sender,
        received_at=_parse_graph_time(str(message.get("receivedDateTime") or "")),
        snippet=body_preview[:320],
        body_text=body_preview[:MAX_BODY_CHARS],
        web_link=str(message.get("webLink") or ""),
        raw_ref=internet_message_id or graph_id,
        is_read=bool(message.get("isRead")),
    )


def _reconcile_graph_unread(
    account: MailAccount,
    server_unread_ids: set[str],
    complete: bool,
) -> None:
    if not complete:
        return

    now = now_iso()
    with _connect() as connection:
        local_unread = connection.execute(
            "SELECT id, source_item_id FROM messages WHERE account_id = ? AND is_read = 0",
            (account.id,),
        ).fetchall()
        handled_ids = [
            str(row["id"])
            for row in local_unread
            if str(row["source_item_id"]) not in server_unread_ids
        ]
        for message_id in handled_ids:
            connection.execute(
                "UPDATE messages SET is_read = 1, updated_at = ? WHERE id = ?",
                (now, message_id),
            )
            connection.execute(
                "DELETE FROM notification_items WHERE source_item_id = ? OR id = ?",
                (message_id, f"notification:{message_id}"),
            )
        connection.commit()


def collect_microsoft_graph_account(account: MailAccount) -> list[MessageItem]:
    token = refresh_microsoft_token(account)

    if not token:
        raise RuntimeError("Microsoft Graph account is not authorized. Start device auth first.")

    recent_query = urllib.parse.urlencode(
        {
            "$top": str(account.max_fetch),
            "$select": GRAPH_MESSAGE_FIELDS,
            "$orderby": "receivedDateTime desc",
        }
    )
    unread_query = urllib.parse.urlencode(
        {
            "$top": str(min(account.max_unread_fetch, 100)),
            "$select": GRAPH_MESSAGE_FIELDS,
            "$filter": "isRead eq false",
        }
    )
    recent_messages, _ = _graph_message_pages(
        f"https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?{recent_query}",
        token,
        account.max_fetch,
    )
    unread_messages, unread_complete = _graph_message_pages(
        f"https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?{unread_query}",
        token,
        account.max_unread_fetch,
    )
    combined = {
        str(message.get("id")): message
        for message in recent_messages + unread_messages
        if message.get("id")
    }
    server_unread_ids = {
        str(message.get("id")) for message in unread_messages if message.get("id")
    }
    _reconcile_graph_unread(account, server_unread_ids, unread_complete)
    return [
        item
        for message in combined.values()
        if (item := _graph_message_item(account, message)) is not None
    ]


PROTECTED_MAIL_TERMS = (
    "billing change",
    "pricing change",
    "price adjustment",
    "api pricing",
    "invoice",
    "payment failed",
    "security alert",
    "service interruption",
    "service discontinuation",
    "terms change",
    "计费调整",
    "计费变更",
    "价格调整",
    "价格变更",
    "费用调整",
    "账单",
    "扣款",
    "退款",
    "安全提醒",
    "服务中断",
    "停止服务",
    "停服",
    "条款变更",
)

MARKETING_MAIL_TERMS = (
    "unsubscribe",
    "newsletter",
    "promotion",
    "promotional",
    "discount",
    "limited-time offer",
    "special offer",
    "deal",
    "coupon",
    "促销",
    "折扣",
    "优惠",
    "限时",
    "满减",
    "免邮",
    "广告",
    "镇店之宝",
    "热卖",
    "特价",
    "好价",
)


def _mail_policy_text(item: MessageItem) -> str:
    return f"{item.title}\n{item.sender}\n{item.snippet}\n{item.body_text}".lower()


def _as_bool(value: Any) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes"}
    return bool(value)


def _apply_analysis_policy(item: MessageItem, analysis: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(analysis)
    text = _mail_policy_text(item)
    protected_terms = [term for term in PROTECTED_MAIL_TERMS if term in text]
    importance = str(normalized.get("importance") or "normal").lower()
    if importance not in {"critical", "important", "normal", "low"}:
        importance = "normal"

    normalized["importance"] = importance
    normalized["needsAttention"] = _as_bool(normalized.get("needsAttention"))
    normalized["category"] = str(normalized.get("category") or "mail").lower()

    if protected_terms:
        normalized["importance"] = "important"
        normalized["needsAttention"] = True
        if any(term in text for term in ("billing", "pricing", "price", "invoice", "payment", "计费", "价格", "费用", "账单", "扣款", "退款")):
            normalized["category"] = "billing"
        else:
            normalized["category"] = "service_change"
        normalized["displayReason"] = (
            "Local safety policy: account, billing, security, or service change."
        )

    normalized["policyVersion"] = ANALYSIS_POLICY_VERSION
    return normalized


def _is_high_confidence_marketing(item: MessageItem, analysis: dict[str, Any]) -> bool:
    text = _mail_policy_text(item)
    if any(term in text for term in PROTECTED_MAIL_TERMS):
        return False

    category = str(analysis.get("category") or "mail").lower()
    importance = str(analysis.get("importance") or "normal").lower()
    needs_attention = _as_bool(analysis.get("needsAttention"))
    has_marketing_evidence = any(term in text for term in MARKETING_MAIL_TERMS)
    return (
        category in LOW_SIGNAL_CATEGORIES
        and importance == "low"
        and not needs_attention
        and has_marketing_evidence
    )


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
    low_keywords = [
        "unsubscribe",
        "newsletter",
        "promotion",
        "discount",
        "deal",
        "recommend",
        "折扣",
        "促销",
        "优惠",
        "推荐",
        "限时",
        "满减",
        "免邮",
        "广告",
        "(ad)",
    ]
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
        "category": "promotion" if low else "mail",
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
        return _apply_analysis_policy(item, _fallback_analysis(item))

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
                    "importance must be one of critical, important, normal, low. "
                    "Use categories such as personal, school, work, security, billing, "
                    "shopping, promotion, newsletter, spam, or mail. Shopping recommendations, "
                    "ads, discounts, promotional newsletters, and spam should be category "
                    "promotion, shopping, newsletter, or spam, importance low, and "
                    "needsAttention false unless they contain a concrete deadline, bill, "
                    "security risk, or action requested by a real person."
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
        return _apply_analysis_policy(item, _fallback_analysis(item))

    content = (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )
    analysis = {**_fallback_analysis(item), **_extract_json_object(str(content))}
    analysis["model"] = model
    return _apply_analysis_policy(item, analysis)


def mark_mail_message_read(message_id: str) -> dict[str, Any]:
    ensure_schema()
    normalized_id = message_id

    if normalized_id.startswith("notification:"):
        normalized_id = normalized_id.removeprefix("notification:")

    with _connect() as connection:
        row = connection.execute(
            """
            SELECT id, source, source_item_id, account_id, account_label,
                   account_email, title, sender, received_at, snippet,
                   web_link, raw_ref, is_read
            FROM messages
            WHERE id = ?
            """,
            (normalized_id,),
        ).fetchone()

    if not row:
        raise ValueError("mail message was not found")

    if bool(row["is_read"]):
        _record_mail_action(normalized_id, "mark_read", "completed", "Handled in MyPage")
        return {"id": normalized_id, "markedRead": True}

    try:
        accounts = {account.id: account for account in load_mail_accounts()}
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"mail account config failed: {exc}") from exc
    account = accounts.get(str(row["account_id"]))
    if not account:
        raise RuntimeError("mail account is not configured")

    item = MessageItem(
        id=str(row["id"]),
        source=str(row["source"]),
        source_item_id=str(row["source_item_id"]),
        account_id=str(row["account_id"]),
        account_label=str(row["account_label"]),
        account_email=str(row["account_email"]),
        title=str(row["title"]),
        sender=str(row["sender"]),
        received_at=str(row["received_at"]),
        snippet=str(row["snippet"]),
        body_text="",
        web_link=str(row["web_link"]),
        raw_ref=str(row["raw_ref"]),
        is_read=False,
    )

    try:
        _mark_message_read(account, item)
    except (imaplib.IMAP4.error, OSError, RuntimeError) as exc:
        _record_mail_action(normalized_id, "mark_read", "failed", "Handled in MyPage", str(exc))
        raise RuntimeError(f"failed to mark mail as read: {exc}") from exc

    _record_mail_action(normalized_id, "mark_read", "completed", "Handled in MyPage")
    return {"id": normalized_id, "markedRead": True}


def _save_analysis(connection: sqlite3.Connection, item: MessageItem, analysis: dict[str, Any]) -> None:
    importance = str(analysis.get("importance") or "normal").lower()
    needs_attention = bool(analysis.get("needsAttention"))
    category = str(analysis.get("category") or "mail").lower()
    action_items = analysis.get("actionItems")

    if not isinstance(action_items, list):
        action_items = []

    connection.execute(
        """
        INSERT INTO message_analysis (
          message_id, importance, needs_attention, category, summary,
          action_items, deadline, display_reason, notification_title,
          model, policy_version, analyzed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          policy_version = excluded.policy_version,
          analyzed_at = excluded.analyzed_at
        """,
        (
            item.id,
            importance,
            1 if needs_attention else 0,
            category,
            str(analysis.get("summary") or item.snippet or item.title),
            json.dumps(action_items, ensure_ascii=False),
            analysis.get("deadline"),
            str(analysis.get("displayReason") or ""),
            str(analysis.get("notificationTitle") or item.title),
            str(analysis.get("model") or "local-fallback"),
            int(analysis.get("policyVersion") or ANALYSIS_POLICY_VERSION),
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
                item.title,
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
    else:
        connection.execute(
            "DELETE FROM notification_items WHERE id = ?",
            (f"notification:{item.id}",),
        )


def _analysis_from_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None

    return {
        "importance": row["importance"],
        "needsAttention": bool(row["needs_attention"]),
        "category": row["category"],
        "summary": row["summary"],
        "actionItems": json.loads(row["action_items"] or "[]"),
        "deadline": row["deadline"],
        "displayReason": row["display_reason"],
        "notificationTitle": row["notification_title"],
        "model": row["model"],
        "policyVersion": int(row["policy_version"] or 0),
    }


def _load_analysis(
    connection: sqlite3.Connection,
    message_id: str,
) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT importance, needs_attention, category, summary,
               action_items, deadline, display_reason,
               notification_title, model, policy_version
        FROM message_analysis
        WHERE message_id = ?
        """,
        (message_id,),
    ).fetchone()
    return _analysis_from_row(row)


def _mail_action_status(
    connection: sqlite3.Connection,
    message_id: str,
    action: str,
) -> str | None:
    row = connection.execute(
        "SELECT status FROM mail_actions WHERE message_id = ? AND action = ?",
        (message_id, action),
    ).fetchone()
    return str(row["status"]) if row else None


def _mail_action_completed(connection: sqlite3.Connection, message_id: str, action: str) -> bool:
    return _mail_action_status(connection, message_id, action) == "completed"


def _record_mail_action(
    message_id: str,
    action: str,
    status: str,
    reason: str,
    error: str | None = None,
) -> None:
    now = now_iso()
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO mail_actions (
              message_id, action, status, reason, attempts, last_error,
              attempted_at, completed_at
            )
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(message_id, action) DO UPDATE SET
              status = excluded.status,
              reason = excluded.reason,
              attempts = mail_actions.attempts + 1,
              last_error = excluded.last_error,
              attempted_at = excluded.attempted_at,
              completed_at = excluded.completed_at
            """,
            (
                message_id,
                action,
                status,
                reason,
                error,
                now,
                now if status == "completed" else None,
            ),
        )
        if status == "completed":
            connection.execute(
                "UPDATE messages SET is_read = 1, updated_at = ? WHERE id = ?",
                (now, message_id),
            )
            connection.execute(
                "DELETE FROM notification_items WHERE source_item_id = ? OR id = ?",
                (message_id, f"notification:{message_id}"),
            )
        connection.commit()


def _mailbox_name_from_list_line(line: bytes) -> str:
    text = line.decode("utf-8", errors="replace").strip()
    quoted = re.search(r'"((?:[^"\\]|\\.)*)"\s*$', text)
    if quoted:
        return quoted.group(1).replace(r'\"', '"')
    return text.rsplit(" ", 1)[-1]


def _resolve_trash_folder(client: imaplib.IMAP4, account: MailAccount) -> str:
    if account.trash_folder:
        return account.trash_folder

    status, folders = client.list()
    if status != "OK" or not folders:
        raise RuntimeError("cannot discover the IMAP trash folder")

    discovered: list[tuple[str, str]] = []
    for raw_line in folders:
        if not isinstance(raw_line, bytes):
            continue
        line = raw_line.decode("utf-8", errors="replace")
        folder = _mailbox_name_from_list_line(raw_line)
        discovered.append((line, folder))
        if "\\Trash" in line:
            return folder

    preferred_names = {
        "deleted messages",
        "trash",
        "inbox.trash",
        "deleted items",
    }
    for _, folder in discovered:
        if folder.lower() in preferred_names:
            return folder

    raise RuntimeError("IMAP server did not advertise a trash folder; set trashFolder")


@contextmanager
def _selected_imap_message(
    account: MailAccount,
    item: MessageItem,
) -> Iterator[tuple[imaplib.IMAP4, str]]:
    if account.provider != "imap":
        raise RuntimeError("mailbox action requires an IMAP account")

    source_parts = item.source_item_id.rsplit(":", 1)
    if len(source_parts) != 2 or not source_parts[1].isdigit():
        raise RuntimeError("message does not contain a usable IMAP UID")
    expected_uidvalidity, uid = source_parts

    context = ssl.create_default_context()
    client: imaplib.IMAP4
    if account.use_ssl:
        client = imaplib.IMAP4_SSL(account.host, account.port, ssl_context=context)
    else:
        client = imaplib.IMAP4(account.host, account.port)

    try:
        client.login(account.username, account.password)
        status, _ = client.select(account.folder, readonly=False)
        if status != "OK":
            raise RuntimeError(f"cannot select folder {account.folder}")

        uidvalidity_values = client.response("UIDVALIDITY")[1]
        current_uidvalidity = (
            str(uidvalidity_values[0], "ascii")
            if uidvalidity_values and uidvalidity_values[0]
            else "default"
        )
        if current_uidvalidity != expected_uidvalidity:
            raise RuntimeError("mailbox UIDVALIDITY changed; refusing to update a stale UID")

        yield client, uid
    finally:
        try:
            client.logout()
        except (imaplib.IMAP4.error, OSError):
            pass


def _move_imap_message_to_trash(account: MailAccount, item: MessageItem) -> None:
    with _selected_imap_message(account, item) as (client, uid):

        trash_folder = _resolve_trash_folder(client, account)
        capabilities = {
            value.decode("ascii", errors="ignore").upper()
            if isinstance(value, bytes)
            else str(value).upper()
            for value in client.capabilities
        }
        if "MOVE" not in capabilities:
            raise RuntimeError("IMAP server does not support atomic MOVE")

        store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", "(\\Seen)")
        if store_status != "OK":
            raise RuntimeError("failed to mark marketing message as read")

        quoted_trash = client._quote(trash_folder)
        move_status, _ = client.uid("MOVE", uid, quoted_trash)
        if move_status != "OK":
            raise RuntimeError("failed to move marketing message to trash")


def _mark_imap_message_read(account: MailAccount, item: MessageItem) -> None:
    with _selected_imap_message(account, item) as (client, uid):
        store_status, _ = client.uid("STORE", uid, "+FLAGS.SILENT", "(\\Seen)")
        if store_status != "OK":
            raise RuntimeError("failed to mark message as read")


def _mark_graph_message_read(account: MailAccount, item: MessageItem) -> None:
    token = refresh_microsoft_token(account)
    if not token:
        raise RuntimeError("Microsoft Graph account is not authorized")

    message_id = urllib.parse.quote(item.source_item_id, safe="")
    _graph_json_request(
        f"https://graph.microsoft.com/v1.0/me/messages/{message_id}",
        token,
        method="PATCH",
        body={"isRead": True},
    )


def _mark_message_read(account: MailAccount, item: MessageItem) -> None:
    if account.provider == "microsoft_graph":
        _mark_graph_message_read(account, item)
        return
    _mark_imap_message_read(account, item)


def _move_graph_message_to_trash(account: MailAccount, item: MessageItem) -> None:
    token = refresh_microsoft_token(account)
    if not token:
        raise RuntimeError("Microsoft Graph account is not authorized")

    message_id = urllib.parse.quote(item.source_item_id, safe="")
    message_url = f"https://graph.microsoft.com/v1.0/me/messages/{message_id}"
    _graph_json_request(
        message_url,
        token,
        method="PATCH",
        body={"isRead": True},
    )
    _graph_json_request(
        f"{message_url}/move",
        token,
        method="POST",
        body={"destinationId": "deleteditems"},
    )


def _move_message_to_trash(account: MailAccount, item: MessageItem) -> None:
    if account.provider == "microsoft_graph":
        _move_graph_message_to_trash(account, item)
        return
    _move_imap_message_to_trash(account, item)


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
    reclassified = 0
    trashed = 0
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
            if account.provider == "microsoft_graph":
                items = collect_microsoft_graph_account(account)
            else:
                items = collect_imap_account(account)
        except (imaplib.IMAP4.error, OSError, RuntimeError, ValueError) as exc:
            errors.append(f"{account.label}: {exc}")
            continue

        trash_candidates: list[tuple[MessageItem, dict[str, Any]]] = []
        with _connect() as connection:
            for item in items:
                changed = _save_message(connection, item)

                if item.is_read:
                    connection.execute(
                        "DELETE FROM notification_items WHERE source_item_id = ? OR id = ?",
                        (item.id, f"notification:{item.id}"),
                    )
                    if (
                        account.marketing_action == "trash"
                        and _mail_action_status(connection, item.id, "trash") == "failed"
                    ):
                        failed_analysis = _load_analysis(connection, item.id)
                        if failed_analysis and _is_high_confidence_marketing(item, failed_analysis):
                            trash_candidates.append((item, failed_analysis))
                    continue

                existing_analysis = _load_analysis(connection, item.id)

                if changed or existing_analysis is None:
                    inserted += 1
                    analysis = analyze_message(item)
                    _save_analysis(connection, item, analysis)
                    analyzed += 1
                elif int(existing_analysis.get("policyVersion") or 0) < ANALYSIS_POLICY_VERSION:
                    analysis = _apply_analysis_policy(item, existing_analysis)
                    _save_analysis(connection, item, analysis)
                    reclassified += 1
                else:
                    analysis = existing_analysis

                if (
                    account.marketing_action == "trash"
                    and _is_high_confidence_marketing(item, analysis)
                    and not _mail_action_completed(connection, item.id, "trash")
                ):
                    trash_candidates.append((item, analysis))

            connection.commit()

        for item, analysis in trash_candidates:
            reason = str(analysis.get("displayReason") or "High-confidence marketing mail")
            try:
                _move_message_to_trash(account, item)
                _record_mail_action(item.id, "trash", "completed", reason)
                trashed += 1
            except (imaplib.IMAP4.error, OSError, RuntimeError) as exc:
                message = f"{account.label}: marketing cleanup failed: {exc}"
                errors.append(message)
                _record_mail_action(item.id, "trash", "failed", reason, str(exc))

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
        "reclassified": reclassified,
        "trashed": trashed,
        "errors": errors,
    }


MAIL_UNREAD_FILTER_SQL = """
    NOT (
      LOWER(m.account_email) LIKE '%@qq.com'
      AND m.title LIKE '[Homework Monitor]%'
    )
    AND COALESCE(m.is_read, 0) = 0
    AND d.message_id IS NULL
"""

MAIL_SELECT_SQL = """
    SELECT
      m.id, m.account_label, m.account_email, m.title, m.sender,
      m.received_at, m.snippet, m.web_link,
      a.importance, a.needs_attention, a.category, a.summary,
      a.action_items, a.deadline, a.display_reason, a.notification_title,
      a.analyzed_at
    FROM messages m
    LEFT JOIN message_analysis a ON a.message_id = m.id
    LEFT JOIN dismissed_messages d ON d.message_id = m.id
"""


def _mail_filter_reason(row: sqlite3.Row) -> str | None:
    if row["needs_attention"] or str(row["importance"] or "") in {"critical", "important"}:
        return None

    category = str(row["category"] or "mail").lower()
    if category in LOW_SIGNAL_CATEGORIES:
        return category
    if str(row["importance"] or "normal").lower() == "low":
        return "low_priority"

    text = f"{row['title']}\n{row['sender']}\n{row['snippet']}".lower()
    if any(term in text for term in MARKETING_MAIL_TERMS):
        return "marketing_pattern"
    return None


def _mail_item_from_row(row: sqlite3.Row, priority: bool) -> dict[str, Any]:
    return {
        "id": row["id"],
        "accountLabel": row["account_label"],
        "accountEmail": row["account_email"],
        "title": row["title"],
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
        "isPriority": priority,
        "filterReason": None if priority else _mail_filter_reason(row),
    }


def mail_messages(view: str = "priority", limit: int = 100) -> dict[str, Any]:
    ensure_schema()
    if view not in {"priority", "unread"}:
        raise ValueError("mail view must be priority or unread")
    limit = max(1, min(limit, 200))
    config_error: str | None = None

    try:
        accounts = load_mail_accounts()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        accounts = []
        config_error = f"mail config failed: {exc}"

    selected_filter = MAIL_VISIBLE_FILTER_SQL if view == "priority" else MAIL_UNREAD_FILTER_SQL
    with _connect() as connection:
        rows = connection.execute(
            f"{MAIL_SELECT_SQL} WHERE {selected_filter} ORDER BY m.received_at DESC LIMIT ?",
            (limit,),
        ).fetchall()
        priority_ids = {
            str(row["id"])
            for row in connection.execute(
                f"SELECT m.id FROM messages m LEFT JOIN message_analysis a ON a.message_id = m.id LEFT JOIN dismissed_messages d ON d.message_id = m.id WHERE {MAIL_VISIBLE_FILTER_SQL}"
            ).fetchall()
        }
        unread_count = int(
            connection.execute(
                f"SELECT COUNT(*) AS count FROM messages m LEFT JOIN dismissed_messages d ON d.message_id = m.id WHERE {MAIL_UNREAD_FILTER_SQL}"
            ).fetchone()["count"]
        )
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
    priority_count = len(priority_ids)
    items = [_mail_item_from_row(row, str(row["id"]) in priority_ids) for row in rows]
    important_count = sum(
        1
        for item in items
        if item["isPriority"]
        and (item["needsAttention"] or item["importance"] in {"critical", "important"})
    )

    return {
        "configured": bool(accounts),
        "error": config_error,
        "view": view,
        "counts": {
            "priority": priority_count,
            "unread": unread_count,
            "filtered": max(0, unread_count - priority_count),
        },
        "hiddenCount": max(0, unread_count - priority_count),
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
        "items": items,
    }


def mail_summary(limit: int = 12) -> dict[str, Any]:
    return mail_messages(view="priority", limit=limit)


def notification_center() -> dict[str, Any]:
    ensure_schema()

    with _connect() as connection:
        rows = connection.execute(
            """
            SELECT n.id, n.source, n.source_item_id, n.title, n.summary, n.time,
                   n.unread, n.importance, n.account_label, n.account_email, n.web_link
            FROM notification_items n
            LEFT JOIN messages m ON m.id = n.source_item_id
            LEFT JOIN dismissed_messages d ON d.message_id = n.source_item_id
            WHERE NOT (
              LOWER(n.account_email) LIKE '%@qq.com'
              AND n.title LIKE '[Homework Monitor]%'
            )
            AND (
              n.source != 'mail'
              OR (
                COALESCE(m.is_read, 0) = 0
                AND d.message_id IS NULL
              )
            )
            ORDER BY n.time DESC
            LIMIT 20
            """
        ).fetchall()

    items = [
        {
            "id": row["id"],
            "sourceItemId": row["source_item_id"],
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
