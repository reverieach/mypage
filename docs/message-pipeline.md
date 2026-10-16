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

Once an API key is configured, unread messages previously handled by local fallback become eligible for AI analysis after 15 minutes from their last analysis. Failed/invalid AI responses remain fallback and use that same retry interval; successful AI results are cached and do not repeat on every refresh. IMAP fetches the body again only for eligible fallback retries. Summaries and action items are requested in concise Chinese, with an 800-token response cap and thinking disabled. Invalid/empty classification JSON is not labeled as an AI success.

DeepSeek output is not applied directly. A versioned local policy runs afterwards and protects billing or pricing changes, invoices, payment failures, security alerts, service interruption, discontinuation, and material terms changes. Original sender, subject, read state, and received time remain mailbox facts and are never rewritten by the model.

## Filtering Rules

The compact Mail widget hides:

- QQ homework delivery emails whose subject starts with `[Homework Monitor]`
- read mail detected through IMAP `\Seen` or Graph `isRead`
- mail covered by a legacy local dismiss record
- low importance mail
- low-signal categories: `shopping`, `promotion`, `newsletter`, `spam`, `marketing`
- locally classified explicit promotions, discounts and advertisements; a sender name, an unsubscribe footer, or `推荐` alone is not sufficient. English keywords match word boundaries (`ideal` does not match `deal`). Important or attention-needed mail remains visible regardless of category.

Priority mail sorts by critical/important/attention-needed status before date. Counts cover the whole cached unread set, not only the twelve cards displayed on the homepage. Local fallback classifications are migrated when the policy version changes.

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
- default is `60` seconds after the previous sync completes.
- set to `0` to disable background sync.

IMAP sync fetches the union of recent UIDs, server `UNSEEN` UIDs, and locally known unread UIDs. It batch-fetches UID/FLAGS, reuses cached bodies within the same UIDVALIDITY and current analysis policy, and uses `BODY.PEEK[]` only for new/unclassified unread mail. New read mail needs only headers. Removed UIDs and invalidated UIDVALIDITY records are removed from the local unread view without modifying the mailbox. `maxFetch` and `maxUnreadFetch` bound the sync window; the expanded unread view is the cached synchronized set, not a promise to enumerate an arbitrarily large inbox.

Concurrent refresh requests are coalesced. Remote mark-read actions serialize with receiving so stale fetches cannot immediately restore a handled card. Network calls have timeouts; background exceptions do not permanently stop polling. New mail is committed with local classification before optional AI analysis, without holding a database write transaction over that API call.

The Mail and Notifications widgets poll only local cached data every 15 seconds. Detail views also refresh, and mark-read invalidates both widgets. Per-account `lastSyncAt`, `lastAttemptAt` and `lastError` reflect receiving, not the time the widget read its cache. Failures retain cached mail and show a stale/error state. A healthy awake device normally discovers mail in roughly one polling interval plus fetch/processing/display time; this is not push delivery and sleep/offline time is not bounded.

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

## Mac QQ setup

After generating a QQ IMAP authorization code yourself on the official site, run the following in a local macOS terminal (not in chat):

```sh
"$HOME/Library/Application Support/MyPage/agent/.venv/bin/python" scripts/configure-qq-mail-macos.py
```

The helper prompts for the numeric QQ email address and hides credential input, checks login using a read-only inbox selection, then updates the existing local Agent configuration. It preserves other accounts and uses `marketingAction: keep`. The credential is stored in a mode-600 local dotenv file, passed to Uvicorn with `--env-file`; this is restricted local plaintext, not encrypted Keychain storage. Keep it and its private backups out of Git and configuration exports. The helper restarts only the main Agent, not VPN or LAN Share. It does not create provider authorization codes or configure Gmail/Outlook.

With explicit consent to send email metadata and truncated text to DeepSeek, the Mac can then run `scripts/configure-deepseek-macos.py` using the same runtime Python. This prompts invisibly for the API key, verifies it at `https://api.deepseek.com/models`, chooses an available Flash model (or the legacy chat model), and saves it in the existing private env file. It does not copy any credential into source control. A successful model-list request verifies authentication, not successful mail analysis or available inference balance; check stored analysis model and a real refresh afterwards.

## Cloud collection trade-off

The local SQLite cache already provides fast widget reads. Cloud collection would add always-on ingestion and shared classification across computers, not automatically improve mailbox delivery time. It also requires explicit approval to store credentials and mail off-device, authenticated per-device access, retention/encryption policy, and reconciliation of remote read state. It must be a separate private service, never an extension of the public Share endpoints. Prefer fixing local polling, incremental fetch and health reporting first. Consider IMAP IDLE after checking the provider's authenticated capabilities; keep polling as recovery. Gmail API push additionally needs Google Cloud Pub/Sub and watch renewal; Graph subscriptions also need lifecycle handling. No cloud mail collector is deployed by this change.
