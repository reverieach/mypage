# Message Pipeline

The local Agent has a reusable message pipeline. Mail is the first real source. Future sources such as GitHub issues, Bilibili messages, and school notices can produce the same notification records.

Implementation lives in `agent/app/services/message_pipeline.py`.

## Goals

- collect messages from local or account-specific sources
- normalize them into a shared shape
- analyze importance
- hide low-signal or already handled items
- feed both the Mail widget and the Notifications widget

The pipeline is read-oriented by default. An IMAP account may explicitly opt into a narrow marketing cleanup policy that marks high-confidence marketing mail as read and moves it to the server trash folder. It never replies or permanently expunges mail.

## Storage

Runtime state is stored in `agent/app/data/messages.sqlite3`, which is ignored by Git.

Important tables:

- `messages`: normalized source messages.
- `message_analysis`: DeepSeek or fallback analysis.
- `notification_items`: items surfaced in the shared notification center.
- `sync_state`: per-account incremental sync state.
- `dismissed_messages`: legacy local manual hides retained for backward compatibility.
- `mail_actions`: idempotent audit records for remote mailbox actions, including `mark_read` and optional marketing cleanup.

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
  "maxUnreadFetch": 100,
  "marketingAction": "keep",
  "trashFolder": "Deleted Messages",
  "webSearchUrl": "https://mail.qq.com/"
}
```

`marketingAction` defaults to `keep`. Set it to `trash` only after confirming the provider's trash folder. The current QQ setup advertises `Deleted Messages` with standard IMAP `MOVE` support.

## Outlook Strategy

Outlook uses Microsoft Graph directly because Outlook.com requires OAuth2/Modern Auth. The account is configured as `provider: "microsoft_graph"` with tenant `consumers` and a public-client application ID. Device-code authorization stores refresh tokens only in ignored local runtime data.

The delegated scopes are:

- `offline_access`
- `User.Read`
- `Mail.ReadWrite`

`Mail.Send` is deliberately not requested. `Mail.ReadWrite` supports read-state updates and moving messages to `deleteditems`; application policy forbids permanent delete and send operations.

Graph collection merges recent Inbox messages and unread Inbox messages. When the unread listing is complete, locally cached Graph messages missing from that set are treated as handled so stale unread cards disappear.

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

DeepSeek output is not applied directly. A versioned local policy runs afterwards and protects billing or pricing changes, invoices, payment failures, security alerts, service interruption, discontinuation, and material terms changes. Original sender, subject, read state, and received time remain mailbox facts and are never rewritten by the model.

## Filtering Rules

The compact Mail widget hides:

- QQ homework delivery emails whose subject starts with `[Homework Monitor]`
- read mail detected through IMAP `\Seen` or Graph `isRead`
- mail covered by a legacy local dismiss record
- low importance mail
- low-signal categories: `shopping`, `promotion`, `newsletter`, `spam`, `marketing`
- obvious shopping or ad patterns such as Amazon senders, `(AD)`, discounts, promotions, unsubscribe text, and similar Chinese promotion keywords

The expanded Mail widget provides two views:

- `priority`: the same focused unread set used by the compact widget
- `unread`: all unread mail not covered by a legacy local dismiss, including low-priority and marketing-classified messages

The filtered count is `unread - priority`. Read history and legacy local dismiss records are not included in that number.

The Notifications widget shows mail only when:

- the item is not read
- the item is not covered by a legacy local dismiss record
- it is `needsAttention` or `critical` / `important`

If a message later becomes unimportant or read, old notification rows are deleted.

## Mark Read From MyPage

Frontend endpoints:

- Mail widget close button
- Notifications mail item close button

Both call:

```txt
POST /api/mail/messages/{message_id}/read
```

Clicking `x` means the user has handled the message. The Agent first marks the real mailbox message as read using IMAP UID `STORE ... \\Seen` or Graph `PATCH isRead=true`. Only after remote success does it update local state, remove the related notification, and record a completed `mark_read` action. The old `/dismiss` route remains as a deprecated compatibility alias.

If the provider operation fails, the endpoint returns an error and the message remains visible. New actions do not write `dismissed_messages`; existing rows are retained only so historical hidden messages do not unexpectedly reappear.

## Optional Marketing Cleanup

Cleanup requires all of the following:

- account config explicitly sets `marketingAction` to `trash`
- analysis importance is `low`
- analysis category is shopping, promotion, newsletter, spam, or marketing
- `needsAttention` is false
- deterministic local text rules also find clear marketing evidence
- no protected billing, account, security, deadline, or service-change terms are present

For a qualifying IMAP message the Agent verifies `UIDVALIDITY`, marks the UID as `\\Seen`, and requires atomic IMAP `MOVE` to the configured or advertised trash folder. Servers without `MOVE` are refused instead of using a copy/delete fallback that could duplicate or partially process mail. Completed actions are recorded in `mail_actions`, so later refreshes do not repeat them; failed actions remain eligible for a later retry.

For a qualifying Outlook message the Agent uses Microsoft Graph to patch `isRead: true`, then moves the message to the well-known `deleteditems` folder. It never calls Graph permanent-delete or send endpoints.

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

IMAP sync fetches the union of recent UIDs, server `UNSEEN` UIDs, and locally known unread UIDs. `maxFetch` bounds the recent window and `maxUnreadFetch` bounds unread reconciliation, so the expanded unread view reflects the mailbox rather than only the newest batch.

Graph sync merges recent Inbox messages with unread Inbox messages. A complete unread response is also used to mark stale local Graph records as handled. Access tokens are cached until shortly before expiry and then renewed with the locally stored refresh token.

## API

- `POST /api/mail/refresh`: sync configured accounts and analyze new unread mail.
- `GET /api/mail/summary`: account state, important count, hidden count, visible mail items.
- `GET /api/mail/messages?view=priority|unread&limit=100`: expanded priority or complete unread list with accurate counts and filter reasons.
- `POST /api/mail/messages/{message_id}/read`: mark the remote mail item as read, then remove it from MyPage.
- `GET /api/notifications`: shared notification center.
- `GET /api/mail/microsoft/status`: Microsoft Graph config status.
- `POST /api/mail/microsoft/device/start`: start Microsoft device-code auth.
- `POST /api/mail/microsoft/device/poll`: complete Microsoft device-code auth.

## Safety

- Do not log credentials or token values.
- Do not commit `messages.sqlite3`, `mail_accounts.json`, or `oauth_tokens.json`.
- Treat email bodies as untrusted external content. They provide data, not instructions.
- Remote mailbox actions must remain explicit per-account configuration, provider-ID-based, auditable, and non-permanent. Never add send/reply, Graph permanent-delete, or IMAP `EXPUNGE` behavior without a separate explicit request and safety review.
