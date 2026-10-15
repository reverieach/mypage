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
cd E:\mypage
.\scripts\start-agent.ps1
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
```

If the Agent is already running and needs a restart, stop only the Agent process listening on `3217`. Do not close unrelated editors, browsers, or user apps.

```powershell
.\scripts\restart-agent.ps1
```

First-time venv install:

```powershell
.\scripts\start-agent.ps1 -Install
```

Stop:

```powershell
.\scripts\stop-agent.ps1
```

## LAN Share Setup

跨网络传输与统一手机域名见 [share-cloud.md](share-cloud.md)。下面的 LAN 功能继续保留，不自动上传旧共享数据。Windows 更新交接见 [windows-share-update-prompt.md](windows-share-update-prompt.md)。

LAN Share is the optional same-network service for phone clipboard text and phone-to-PC file transfer. It is a separate process from the main Agent.

Start:

```powershell
cd E:\mypage
.\scripts\start-share.ps1
```

Restart:

```powershell
.\scripts\restart-share.ps1
```

Stop:

```powershell
.\scripts\stop-share.ps1
```

Status from the desktop Agent:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/share/status
```

Status from the LAN service:

```powershell
Invoke-RestMethod http://127.0.0.1:3220/api/share/status
```

Startup:

```powershell
.\scripts\start-mypage.ps1
.\scripts\install-startup-task.ps1
```

The Windows logon task should point to `scripts\start-mypage.ps1`, which starts both the local desktop Agent on `127.0.0.1:3217` and the LAN Share service on `0.0.0.0:3220`. If the widget shows `Share off` while the main page still works, check whether `http://127.0.0.1:3220/api/share/status` is reachable and rerun `.\scripts\start-share.ps1` or reinstall the startup task.

The Share widget shows the LAN URL and a QR button, usually similar to:

```txt
http://10.x.x.x:3220/share
```

Scan the QR code with the iOS camera while the phone and PC are on the same network. Enter the 6-digit PIN shown in the desktop widget. The phone receives a bearer token that expires after 7 days by default, so the same phone browser normally does not need the PIN again until the token expires, the PIN is reset, or the phone browser data is cleared.

PIN and IP behavior:

- The PIN is stored in `E:\MyPageShare\lan_share.sqlite3` and stays stable across page refreshes and service restarts.
- `POST /api/share/reset-pin` resets the PIN and invalidates existing phone tokens.
- The LAN URL is detected from the PC's current IPv4 addresses each time `/api/share/status` is read.
- On the same Wi-Fi or wired network, the LAN IP usually stays unchanged.
- The LAN IP may change after switching networks, reconnecting VPN, changing hotspot, rebooting the router, DHCP renewal, or changing network adapters.

Runtime data:

```txt
E:\MyPageShare\lan_share.sqlite3
E:\MyPageShare\files\
```

Desktop behavior:

- Drag files into the Share widget drop area to upload them to the shared area.
- Shared items are shown as square cards. Images show thumbnails; text is shown once as a note-style card.
- File `Open` asks the local Agent to reveal the real file in Windows Explorer.
- File `Copy` asks the local Agent to put the real file onto the Windows clipboard, so it can be pasted into another desktop app.
- Text items only expose `Copy`, which copies the text in the browser.
- The QR button replaces the old "open share" affordance because the useful destination is the phone, not another desktop tab.

Useful environment variables:

```txt
MYPAGE_SHARE_PORT
MYPAGE_SHARE_DIR
MYPAGE_SHARE_DB_PATH
MYPAGE_SHARE_FILE_DIR
MYPAGE_SHARE_MAX_FILE_BYTES
MYPAGE_SHARE_TOKEN_DAYS
```

Security boundary:

- Keep `3217` bound to `127.0.0.1`.
- Only the small Share service listens on `0.0.0.0:3220`.
- Do not expose `3220` through router port forwarding or public tunnels unless a stronger auth layer is added.
- If Windows Firewall prompts for Python on private networks, allowing private-network access is enough for same-Wi-Fi use.
- VPNs may change the visible LAN IP or block local-device discovery. If the phone cannot connect, try the other URL listed by the Share widget, disable "block LAN traffic" in the VPN, or temporarily disconnect the VPN.

Smoke test:

```powershell
$status = Invoke-RestMethod http://127.0.0.1:3217/api/share/status
$pin = $status.data.pin
$auth = Invoke-RestMethod -Method Post http://127.0.0.1:3220/api/share/auth `
  -ContentType "application/json" `
  -Body (@{ pin = $pin } | ConvertTo-Json -Compress)
Invoke-RestMethod -Method Post http://127.0.0.1:3220/api/share/text `
  -Headers @{ Authorization = "Bearer $($auth.token)" } `
  -ContentType "application/json" `
  -Body '{"text":"hello from phone path"}'
Invoke-RestMethod http://127.0.0.1:3220/api/share/items `
  -Headers @{ Authorization = "Bearer $($auth.token)" }
```

## Environment Variables

Common Agent environment variables:

```txt
DEEPSEEK_API_KEY
DEEPSEEK_BASE_URL
DEEPSEEK_MODEL
MAIL_SYNC_INTERVAL_SECONDS
QQ_MAIL_AUTH_CODE
MICROSOFT_GRAPH_CLIENT_ID
HOMEWORK_PROJECT_DIR
HOMEWORK_REFRESH_TIMEOUT_SECONDS
WEATHER_CACHE_TTL_SECONDS
WEATHER_TIMEOUT_SECONDS
OPEN_METEO_FORECAST_URL
MYPAGE_SHARE_PORT
MYPAGE_SHARE_DIR
MYPAGE_SHARE_MAX_FILE_BYTES
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

The Mail widget hides read, legacy-dismissed, low-signal, and obvious promotion mail. Clicking an item's `x` marks it read in the real mailbox before removing it from MyPage.

## Weather Setup

The weather widget uses the local Agent as a cache boundary. The frontend does not call external weather APIs directly.

Default settings:

```txt
provider: open-meteo
active location: 北邮, Beijing
cache TTL: 30 minutes
```

Runtime files:

```txt
agent/app/data/weather_settings.json
agent/app/data/weather_cache.json
```

Manual checks:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/weather/summary
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/weather/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/weather/settings
```

Open-Meteo requires no API key for this personal setup. If the external request fails but cache exists, the Agent returns the cached payload with `fromCache=true`.

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

## Course Schedule Setup

The Today widget uses a local fixed course schedule, not a school-system refresh.

Runtime file:

```txt
agent/app/data/course_schedule.json
```

The current imported schedule comes from the user's `学生个人课表_2023211892.xls` and is intentionally stored only in ignored local data.

Read today's courses:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/school/today
```

Schedule rules:

- `term.startDate` is the Monday of week 1.
- `weekNumber` is calculated from `term.startDate`.
- Courses are shown only when today's weekday matches and today's week is included in the course's `weeks`.
- The Agent marks each course as `upcoming`, `current`, or `finished` using local Beijing time.
- When a semester changes, replace `course_schedule.json` with the new imported schedule.

## Build And Verify

Frontend:

```powershell
cd E:\mypage
.\scripts\build-extension.ps1
```

Agent:

```powershell
cd E:\mypage\agent
python -m compileall app
```

Recommended full smoke test:

```powershell
.\scripts\smoke-test.ps1
.\scripts\smoke-test.ps1 -Full
```

## Browser Extension

Build:

```powershell
cd E:\mypage
.\scripts\build-extension.ps1
```

Load `E:\mypage\frontend\dist` as an unpacked extension in Chrome or Edge.

The extension overrides the new-tab page. Dynamic widgets still require the local Agent.

The Agent also serves the production frontend at:

```txt
http://127.0.0.1:3217/
```

Use that URL as the browser startup page.

## School Notices

Default URL:

```txt
http://my.bupt.edu.cn/list.jsp?urltype=tree.TreeTempUrl&wbtreeid=1154
```

Common environment variables:

```txt
SCHOOL_NOTICE_URL
SCHOOL_NOTICE_COOKIE_PATH
SCHOOL_NOTICE_SESSION_MAX_AGE_SECONDS
SCHOOL_NOTICE_COOKIE_REFRESH_GRACE_SECONDS
SCHOOL_NOTICE_STARTUP_TTL_SECONDS
SCHOOL_NOTICE_STARTUP_DELAY_SECONDS
```

Manual read and refresh:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices
Invoke-RestMethod -Method Post http://127.0.0.1:3217/api/school/notices/refresh
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices/status
```

Auth notes:

- Homework `valid_headers.json` is for ucloud/apiucloud homework APIs and does not authenticate `my.bupt.edu.cn`.
- School notices use `agent/app/data/school_portal_cookies.json` by default, or `SCHOOL_NOTICE_COOKIE_PATH` when set.
- The cookie file is a small auth status store, not just a raw cookie dump. It records `capturedAt`, `lastValidatedAt`, `lastFailureType`, and a local session health window.
- BUPT currently returns a session `JSESSIONID` without a reliable expiry timestamp, so MyPage treats the session as proactively refreshable after `SCHOOL_NOTICE_SESSION_MAX_AGE_SECONDS` seconds. The default is 2 hours.
- If portal cookies are missing, too old, or a request returns a CAS/login page, manual refresh may use Playwright to log into the BUPT portal and capture a fresh `JSESSIONID`.
- If Playwright reports a missing browser executable, run `.\.venv\Scripts\python.exe -m playwright install chromium` from `E:\mypage\agent`.
- Refresh failures keep the last successful SQLite notice cache. The API returns `stale=true` plus `lastErrorType` instead of falling back to sample data.
- On Agent startup, MyPage waits briefly and then silently refreshes School Notices only when the cache is empty or older than `SCHOOL_NOTICE_STARTUP_TTL_SECONDS`. The default is `43200` seconds, or 12 hours. Set it to `0` to disable startup refresh. `SCHOOL_NOTICE_STARTUP_DELAY_SECONDS` controls the startup delay and defaults to `8`.

Useful diagnosis:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
Invoke-RestMethod http://127.0.0.1:3217/api/school/notices/status
sqlite3 .\agent\app\data\school_notices.sqlite3 "select key,value,updated_at from school_notice_sync_state order by key;"
```

Common `lastErrorType` values:

- `auth`: cookie expired, login page returned, or Playwright login failed.
- `network`: the portal or local network refused/failed the request.
- `timeout`: request exceeded the configured timeout.
- `io`: local file or SQLite read/write problem.
- `config`: missing or invalid local configuration.

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

LAN Share stores runtime files outside the repository at `E:\MyPageShare` by default. Treat that directory as personal local data.

## Troubleshooting

Agent unavailable:

- confirm port `3217` is listening
- check `agent/agent-server.err.log` if started by background process
- call `/health`

Mail looks noisy:

- check `DEEPSEEK_API_KEY`
- run `/api/mail/refresh`
- inspect `hiddenCount` in `/api/mail/summary`
- mark individual items as read with the frontend `x` control

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

Phone cannot open Share URL:

- confirm `.\scripts\start-share.ps1` is running and `http://127.0.0.1:3220/api/share/status` works on the PC
- confirm phone and PC are on the same Wi-Fi or routed LAN
- try every URL listed in the Share widget
- check Windows Firewall private-network permission for Python
- check whether VPN split tunneling or LAN blocking is enabled
