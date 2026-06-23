# MyPage Local Agent

Local FastAPI service for dynamic start page data.

The Agent should bind to `127.0.0.1:3217` and expose normalized JSON for widgets. It is intentionally separate from the frontend so browser code never sees local secrets or raw automation scripts.
