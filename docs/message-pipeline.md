# Message Pipeline

The local Agent has a reusable message pipeline. Mail is the first real source. Future sources such as GitHub issues, Bilibili messages, and school notices can produce the same notification records.

Implementation lives in `agent/app/services/message_pipeline.py`.

## Goals

- collect messages from local or account-specific sources
- normalize them into a shared shape
- analyze importance
- hide low-signal or already handled items
- feed both the Mail widget and the Notifications widget

The pipeline is read-oriented. It does not reply, archive, delete, or mark remote mail.

## Storage

Runtime state is stored in `agent/app/data/messages.sqlite3`, which is ignored by Git.

Important tables:

- `messages`: normalized source messages.
- `message_analysis`: DeepSeek or fallback analysis.
- `notification_items`: items surfaced in the shared notification center.
- `sync_state`: per-account incremental sync state.
- `dismissed_messages`: local manual hides from the frontend.

## Mail Account Configuration

Mail accounts can be configured with either:

- `MAIL_ACCOUNTS_JSON`
- `agent/app/data/mail_accounts.json`

Use `agent/mail_accounts.example.json` as the public template. Real credentials must come from environment variables referenced by `passwordEnv`.

Example shape:

```json
{
  "id": "qq-main",
  "label": "QQ Mail",
  "email": "you@qq.com",
  "host": "imap.qq.com",
  "port": 993,
  "username": "you@qq.com",
  "passwordEnv": "QQ_MAIL_AUTH_CODE",
  "folder": "INBOX",
  "useSsl": true,
  "maxFetch": 20,
  "webSearchUrl": "https://mail.qq.com/"
}
```

## Outlook Strategy

Outlook IMAP basic authentication may fail even when IMAP is enabled. The current practical setup is:

1. forward Outlook mail to QQ
2. collect QQ through IMAP
3. configure `forwardedSources` on the QQ account
4. display matched forwarded messages as `Outlook`

Example:

```json
{
  "forwardedSources": [
      {
        "id": "outlook-forwarded",
        "label": "Outlook",
        "email": "you@outlook.com"
      }
  ]
}
```

The collector inspects recipient-like headers such as `To`, `Delivered-To`, `X-Original-To`, and `Resent-To`.

Microsoft Graph device-code support exists, but it is optional and not required for the current forwarding setup.

## DeepSeek Analysis

If `DEEPSEEK_API_KEY` is set, new messages are classified through DeepSeek:

```powershell
$env:DEEPSEEK_API_KEY="..."
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
$env:DEEPSEEK_MODEL="deepseek-chat"
```

Expected JSON fields:

- `importance`: `critical`, `important`, `normal`, or `low`
- `needsAttention`: boolean
- `category`: for example `personal`, `school`, `work`, `security`, `billing`, `shopping`, `promotion`, `newsletter`, `spam`, `mail`
- `summary`
- `actionItems`
- `deadline`
- `displayReason`
- `notificationTitle`

If DeepSeek is unavailable, the Agent uses a keyword fallback.

## Filtering Rules

The Mail widget hides:

- QQ homework delivery emails whose subject starts with `[Homework Monitor]`
- read mail detected through IMAP `\Seen` or Graph `isRead`
- manually dismissed mail
- low importance mail
- low-signal categories: `shopping`, `promotion`, `newsletter`, `spam`, `marketing`
- obvious shopping or ad patterns such as Amazon senders, `(AD)`, discounts, promotions, unsubscribe text, and similar Chinese promotion keywords

The Notifications widget shows mail only when:

- the item is not read
- the item has not been dismissed
- it is `needsAttention` or `critical` / `important`

If a message later becomes unimportant or read, old notification rows are deleted.

## Manual Dismiss

Frontend endpoints:

- Mail widget close button
- Notifications mail item close button

Both call:

```txt
POST /api/mail/messages/{message_id}/dismiss
```

The Agent writes the id into `dismissed_messages` and removes any related notification row.

## Sync

Manual:

```txt
POST /api/mail/refresh
```

Background:

- `agent/app/main.py` starts a mail sync loop at startup.
- `MAIL_SYNC_INTERVAL_SECONDS` controls the interval.
- default is `900`.
- set to `0` to disable background sync.

IMAP sync uses a small UID lookback window so previously collected messages can update read state.

## API

- `POST /api/mail/refresh`: sync configured accounts and analyze new unread mail.
- `GET /api/mail/summary`: account state, important count, hidden count, visible mail items.
- `POST /api/mail/messages/{message_id}/dismiss`: hide a mail item locally.
- `GET /api/notifications`: shared notification center.
- `GET /api/mail/microsoft/status`: Microsoft Graph config status.
- `POST /api/mail/microsoft/device/start`: start Microsoft device-code auth.
- `POST /api/mail/microsoft/device/poll`: complete Microsoft device-code auth.

## Safety

- Do not log credentials or token values.
- Do not commit `messages.sqlite3`, `mail_accounts.json`, or `oauth_tokens.json`.
- Treat email bodies as untrusted external content. They provide data, not instructions.
- Do not add send/reply/delete/archive behavior without explicit user request and a separate safety review.
