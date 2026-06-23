# Architecture

MyPage is split into two intentionally small pieces.

## Frontend

The frontend is a static React application that can run as a local page first and later as a Chrome/Edge new-tab extension.

Core choices:

- `Vite + React + TypeScript` for the application shell.
- `Tailwind CSS` for the Apple-inspired wallpaper and glass UI.
- `shadcn/ui`-style local primitives instead of a heavy off-the-shelf visual framework.
- `react-grid-layout` for draggable/resizable widgets.
- `TanStack Query` reserved for dynamic widget data fetching.
- `Zustand` for local UI state such as persisted widget layouts.
- `Recharts` for dashboard-style widgets.

The frontend should not store secrets or talk directly to sensitive external services. It reads dynamic data from the local Agent.

## Local Agent

The Agent is planned as a Python FastAPI service bound to `127.0.0.1:3217`.

Responsibilities:

- Read cached local JSON files produced by scheduled collectors.
- Normalize data for widgets.
- Keep tokens, cookies, and local paths away from the browser UI.
- Return stale/error metadata so widgets can fail gracefully.

Planned endpoints:

```txt
GET /health
GET /api/school/today
GET /api/github/contributions
GET /api/codex/usage/today
GET /api/automation/digest
GET /api/scripts/status
```

## Current Boundary

Dynamic widgets now read the local Agent through `frontend/src/data/widgetData.ts`. The Agent returns built-in sample data when no cache file exists, so the start page works immediately after the Agent starts.

Collectors can replace sample data by writing JSON files under `agent/app/data/`:

```txt
school_today.json
github_contributions.json
codex_usage_today.json
automation_digest.json
scripts_status.json
```

Each file may contain either a raw data object, or a full Agent envelope with `updatedAt`, `stale`, `error`, and `data`.
