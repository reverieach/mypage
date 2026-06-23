# MyPage

Personal Chrome/Edge start page and future new-tab extension.

The current milestone establishes the first large foundation:

- Vite + React + TypeScript frontend.
- Tailwind CSS with an Apple-inspired glass start page shell.
- `shadcn/ui`-style local primitives for buttons and cards.
- Config-driven search engines, quick links, widgets, and theme token placeholder.
- Draggable/resizable widget grid with layout persisted to `localStorage`.
- Mock widgets for links, GitHub heatmap, school info, Codex usage, automation digest, and script status.
- Python FastAPI Agent boundary reserved for local dynamic data.

## Development

```bash
cd frontend
npm install
npm run dev
```

Build and lint:

```bash
cd frontend
npm run lint
npm run build
```

## Agent Preview

The Agent will eventually run on `127.0.0.1:3217` and provide local JSON APIs for dynamic widgets. A minimal FastAPI health endpoint is scaffolded under `agent/`.

```bash
cd agent
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 3217
```
