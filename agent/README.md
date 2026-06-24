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

The notice service fetches the BUPT notice list, filters for student-relevant items, and stores dismissed notice ids locally. It can reuse saved BUPT auth headers from the homework project.
