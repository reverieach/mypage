# MyPage Local Agent

Local FastAPI service for dynamic start page data.

The Agent should bind to `127.0.0.1:3217` and expose normalized JSON for widgets. It is intentionally separate from the frontend so browser code never sees local secrets or raw automation scripts.

## Run

```bash
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --host 127.0.0.1 --port 3217
```

## Cache Contract

Collector scripts can write raw JSON objects or full Agent envelopes into `app/data/`.

```txt
school_today.json
github_contributions.json
codex_usage_today.json
automation_digest.json
scripts_status.json
```
