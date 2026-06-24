# MyPage

MyPage is a personal Chrome/Edge start page and new-tab dashboard.

It combines:

- wallpaper-style start page UI
- search with selectable engines
- draggable/resizable widgets
- quick links with favicons and folder-like detail view
- mail summary and notification center
- BUPT homework due widget with silent manual refresh
- BUPT school notices widget with relevance filtering
- Agent-backed config backup with snapshots and import/export
- local Agent boundary for private data and automation

The project is intentionally personal-first: local, small, configurable, and safe to iterate on.

## Structure

```txt
frontend/  Vite + React + TypeScript start page
agent/     FastAPI local Agent on 127.0.0.1:3217
docs/      architecture, widget contract, operations, pipeline notes
```

Read first:

- `AGENTS.md`
- `docs/architecture.md`
- `docs/widget-contract.md`
- `docs/message-pipeline.md`
- `docs/operations.md`

## Frontend

```powershell
cd frontend
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Verify:

```powershell
npm run lint
npm run build
```

## Local Agent

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:3217/health
```

Verify:

```powershell
cd agent
python -m compileall app
```

## Key APIs

```txt
GET  /health
GET  /api/config/load
POST /api/config/save
GET  /api/config/snapshots
POST /api/config/snapshots/{snapshot_id}/restore
GET  /api/homework/due
POST /api/homework/refresh
GET  /api/school/notices
POST /api/school/notices/refresh
POST /api/school/notices/{notice_id}/dismiss
GET  /api/mail/summary
POST /api/mail/refresh
POST /api/mail/messages/{message_id}/dismiss
GET  /api/notifications
```

## Privacy

Runtime files under `agent/app/data/` are ignored by Git. They may contain mail state, local tokens, account config, or personal data.

Do not commit:

- real API keys
- mailbox app passwords
- OAuth tokens
- `agent/app/data/*.json`
- `agent/app/data/*.sqlite3`

## Extension

Build the frontend:

```powershell
.\scripts\build-extension.ps1
```

Then load `frontend/dist` as an unpacked extension in Chrome or Edge. Dynamic widgets still need the local Agent.

## Local Production

For daily use, build once and start the Agent:

```powershell
.\scripts\build-extension.ps1
.\scripts\start-agent.ps1
```

Open:

```txt
http://127.0.0.1:3217/
```

This production URL is suitable for the browser startup page. The unpacked extension is suitable for the new-tab page.

Verify:

```powershell
.\scripts\smoke-test.ps1
```
