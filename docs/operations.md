# Operations

This document is for local maintenance and future agents working on MyPage.

## Start Frontend

```powershell
cd E:\mypage\frontend
npm install
npm run dev
```

Default dev URL:

```txt
http://127.0.0.1:5173/
```

## Start Agent

```powershell
cd E:\mypage\agent
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
```

If the Agent is already running and needs a restart, stop only the Agent process listening on `3217`. Do not close unrelated editors, browsers, or user apps.

## Environment Variables

Common Agent environment variables:

```txt
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
MAIL_SYNC_INTERVAL_SECONDS
QQ_MAIL_AUTH_CODE
OUTLOOK_MAIL_APP_PASSWORD
MICROSOFT_GRAPH_CLIENT_ID
HOMEWORK_PROJECT_DIR
HOMEWORK_REFRESH_TIMEOUT_SECONDS
```

Do not store real secret values in committed files.

## Mail Setup

Local runtime config:

```txt
agent/app/data/mail_accounts.json
```

Public template:

```txt
agent/mail_accounts.example.json
```

Manual refresh:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/mail/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/mail/summary
Invoke-RestMethod http://127.0.0.1:3217/api/notifications
```

The Mail widget hides read, dismissed, low-signal, and obvious promotion mail.

## Config Backup

Trusted local config backup:

```txt
agent/app/data/user_config.sqlite3
```

Useful API checks:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/config/load
Invoke-RestMethod http://127.0.0.1:3217/api/config/snapshots
```

The frontend automatically syncs these user data groups:

- links
- wallpapers
- hidden widgets
- widget layouts
- sticky note
- selected search engine

Settings has a Backup tab for backup status, JSON export/import, and restoring the latest snapshot. `localStorage` remains the fast browser cache; Agent SQLite is the trusted local backup.

Link icons are not part of user config. They are derived Agent cache data in:

```txt
agent/app/data/link_icons.sqlite3
agent/app/data/link-icons/
```

Check a link icon through the stable resolver:

```powershell
Invoke-WebRequest "http://127.0.0.1:3217/api/link-icons/resolve?href=https%3A%2F%2Fgithub.com"
```

Refresh a cached icon without changing link config:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/link-icons/cache `
  -ContentType "application/json" `
  -Body '{"href":"https://github.com","refresh":true}'
```

Do not store `/api/link-icons/files/...` URLs in links. Concrete icon files are cache internals.

## Homework Setup

Default project path:

```txt
E:\作业获取项目
```

Default data file:

```txt
E:\作业获取项目\homework_db.json
```

Read current 0-3 day homework:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/homework/due
```

Silent manual refresh:

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/homework/refresh
```

Important: manual refresh must not trigger notifications. The Agent uses a silent wrapper that saves homework state but does not call the homework project's `Notifier`.

If the project moves, set:

```powershell
$env:HOMEWORK_PROJECT_DIR="D:\Projects\HomeworkSentinel"
```

## Build And Verify

Frontend:

```powershell
cd E:\mypage\frontend
npm run lint
npm run build
```

Agent:

```powershell
cd E:\mypage\agent
python -m compileall app
```

Recommended full smoke test:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
Invoke-RestMethod http://127.0.0.1:3217/api/config/load
Invoke-RestMethod http://127.0.0.1:3217/api/homework/due
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/homework/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/school/notices/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/mail/summary
Invoke-RestMethod http://127.0.0.1:3217/api/notifications
```

## Browser Extension

Build:

```powershell
cd E:\mypage\frontend
npm run build
```

Load `E:\mypage\frontend\dist` as an unpacked extension in Chrome or Edge.

The extension overrides the new-tab page. Dynamic widgets still require the local Agent.

## School Notices

Default URL:

```txt
http://my.bupt.edu.cn/list.jsp?urltype=tree.TreeTempUrl&wbtreeid=1154
```

Common environment variables:

```txt
SCHOOL_NOTICE_URL
SCHOOL_NOTICE_COOKIE_PATH
```

Manual read and refresh:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/school/notices/refresh
```

Auth notes:

- Homework `valid_headers.json` is for ucloud/apiucloud homework APIs and does not authenticate `my.bupt.edu.cn`.
- School notices use `agent/app/data/school_portal_cookies.json` by default, or `SCHOOL_NOTICE_COOKIE_PATH` when set.
- If portal cookies are missing or expired, manual refresh may use Playwright to log into the BUPT portal and capture a fresh `JSESSIONID`.
- If Playwright reports a missing browser executable, run `.\.venv\Scripts\python.exe -m playwright install chromium` from `E:\mypage\agent`.

## Local Data

Ignored runtime files:

```txt
agent/app/data/*.json
agent/app/data/*.sqlite3
agent/app/data/link-icons/
agent/*.log
frontend/dist/
frontend/node_modules/
agent/.venv/
```

These may contain secrets, personal mail, local tokens, or private data. Do not commit them.

## Troubleshooting

Agent unavailable:

- confirm port `3217` is listening
- check `agent/agent-server.err.log` if started by background process
- call `/health`

Mail looks noisy:

- check `DEEPSEEK_API_KEY`
- run `/api/mail/refresh`
- inspect `hiddenCount` in `/api/mail/summary`
- dismiss individual items from the frontend

Homework refresh stale:

- call `/api/homework/refresh`
- check whether `E:\作业获取项目\homework_db.json` exists
- run the homework project manually only if you intentionally want its normal notification behavior

School notices stale:

- confirm `agent/app/data/school_portal_cookies.json` exists and is recent
- run `/api/school/notices/refresh` to refresh portal cookies when they expire
- install Playwright Chromium if the refresh path reports a missing browser executable
- dismiss unwanted notices from the frontend instead of editing cache files manually

Widget restored too small or in the wrong place:

- check `frontend/src/layout/defaultLayouts.ts`
- make sure Settings uses `appendWidgetLayout` before `showWidget`
- do not bypass restored-widget placement by editing only `hiddenWidgetIds`

Config backup missing:

- confirm Agent is running on port `3217`
- open Settings -> Backup -> Refresh
- check `agent/app/data/user_config.sqlite3`
- export a JSON backup before risky changes
