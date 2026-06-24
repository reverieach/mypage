# MyPage

MyPage is a personal Chrome/Edge start page and new-tab dashboard. It is built for one local Windows user rather than a hosted SaaS product.

The page combines an Apple-style wallpaper surface, search, draggable widgets, quick links, mail summaries, notifications, BUPT homework, school notices, and a local config backup.

## Features

- Wallpaper-first start page with image/video wallpapers, local video posters, and optional random wallpaper groups.
- Search bar with selectable engines.
- Draggable and resizable widget grid.
- Quick links with locally cached favicons, folder-style detail view, sorting, and inline add/remove.
- Local mail digest and notification center, with DeepSeek-assisted importance filtering when configured.
- BUPT homework widget for unfinished assignments due in the next `0-3d`.
- BUPT school notices widget with relevance filtering and manual dismiss.
- Agent-backed config backup with SQLite snapshots, import, and export.
- Chrome/Edge extension build for overriding the new-tab page.
- Agent-hosted production page for browser startup pages.

## Architecture

```txt
frontend/  Vite + React + TypeScript UI
agent/     FastAPI local Agent bound to 127.0.0.1:3217
docs/      architecture, widget, message pipeline, release, and operations notes
scripts/   Windows helper scripts for build, startup, smoke tests, and Agent control
```

The frontend never reads mailbox credentials, local cookies, third-party API keys, or local automation files directly. Dynamic and private data is accessed through the local Agent.

## Quick Start

Install the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open:

```txt
http://127.0.0.1:5173/
```

Install and run the local Agent:

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

## Daily Local Use

Build the frontend and let the Agent serve the production page:

```powershell
.\scripts\build-extension.ps1
.\scripts\start-agent.ps1
```

Open:

```txt
http://127.0.0.1:3217/
```

This URL is suitable for the browser startup page. The extension build is suitable for the new-tab page.

## Chrome/Edge New Tab

Build:

```powershell
.\scripts\build-extension.ps1
```

Then load `frontend/dist` as an unpacked extension:

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

Enable developer mode, choose "Load unpacked", and select `frontend/dist`.

## Homework Project Relationship

MyPage does not replace the separate homework-fetching project. It consumes that project's local state and can trigger a silent refresh.

By default, the Agent expects:

```txt
E:/作业获取项目/homework_db.json
```

Override it with:

```powershell
$env:HOMEWORK_PROJECT_DIR="D:\path\to\homework-project"
```

`POST /api/homework/refresh` runs the homework project's core fetch logic in silent mode. It updates the local homework state file but suppresses email, desktop, markdown, webhook, WeChat, PushPlus, and other notification channels.

See [docs/homework-integration.md](docs/homework-integration.md) for the integration contract.

## Privacy

This repository is intended to contain source code and documentation only. Runtime files are ignored by Git.

Do not commit:

- real API keys
- mailbox app passwords or OAuth tokens
- portal cookies
- local mail account config
- `agent/app/data/*.json`
- `agent/app/data/*.sqlite3`
- `agent/app/data/link-icons/`
- `agent/app/data/wallpapers/`
- `frontend/dist/`
- `release/`

Public templates live in:

- `agent/.env.example`
- `agent/mail_accounts.example.json`

## Verification

Frontend:

```powershell
cd frontend
npm run lint
npm run build
```

Agent:

```powershell
cd agent
python -m compileall app
```

Smoke test:

```powershell
.\scripts\smoke-test.ps1
```

## Documentation

Read these before changing the project:

- [AGENTS.md](AGENTS.md)
- [docs/architecture.md](docs/architecture.md)
- [docs/widget-contract.md](docs/widget-contract.md)
- [docs/message-pipeline.md](docs/message-pipeline.md)
- [docs/operations.md](docs/operations.md)
- [docs/extension.md](docs/extension.md)
- [docs/release-checklist.md](docs/release-checklist.md)
