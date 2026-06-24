# MyPage Local Agent

The Agent is a local FastAPI service for dynamic start page data.

It must bind to `127.0.0.1:3217`. Browser code should never read local secrets, local automation files, mailbox credentials, or third-party API keys directly.

## Run

```powershell
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 3217
```

## Verify

```powershell
python -m compileall app
Invoke-RestMethod http://127.0.0.1:3217/health
```

## Runtime Data

Ignored local data lives under:

```txt
app/data/
```

Common files:

- `mail_accounts.json`: local mail account config.
- `oauth_tokens.json`: Microsoft Graph refresh tokens.
- `messages.sqlite3`: normalized messages, analyses, notification state.
- `user_config.sqlite3`: trusted local backup for user config and layout snapshots.
- optional widget cache JSON files.

Do not commit runtime data.

## Cache-Backed Widgets

The Agent can return cache files or sample data for:

- `school_today.json`
- `github_contributions.json`
- `codex_usage_today.json`
- `automation_digest.json`
- `scripts_status.json`
- `notifications.json`

Each file may contain raw widget data or a full Agent envelope.

## Config Backup

Main endpoints:

- `GET /api/config/load`
- `POST /api/config/save`
- `GET /api/config/snapshots`
- `POST /api/config/snapshots/{snapshot_id}/restore`

The frontend still uses `localStorage` as a fast browser cache, but this SQLite store is the trusted local backup for links, wallpapers, hidden widgets, layouts, sticky note text, and the selected search engine. Each save snapshots the previous config before replacing it.

## Mail

Main endpoints:

- `GET /api/mail/summary`
- `POST /api/mail/refresh`
- `POST /api/mail/messages/{message_id}/dismiss`
- `GET /api/notifications`

Mail analysis uses DeepSeek when `DEEPSEEK_API_KEY` is present and falls back to local keywords otherwise.

## Homework

Main endpoints:

- `GET /api/homework/due`
- `POST /api/homework/refresh`

Manual refresh is silent. It updates the homework project state file but does not send email, desktop, markdown, webhook, WeChat, or PushPlus notifications.

## School Notices

Main endpoints:

- `GET /api/school/notices`
- `POST /api/school/notices/refresh`
- `POST /api/school/notices/{notice_id}/dismiss`

The notice service fetches the BUPT notice list, filters for student-relevant items, and stores dismissed notice ids locally.

It does not use the homework project's `valid_headers.json` for portal auth: those headers belong to the ucloud homework API. School notices use `app/data/school_portal_cookies.json` for `my.bupt.edu.cn` cookies, and refresh those cookies through a Playwright portal login when needed.
