# Browser Extension

MyPage can be loaded as a Chrome or Edge new-tab extension after building the frontend.

## Build

```powershell
cd E:\mypage\frontend
npm run build
```

## Load In Chrome Or Edge

1. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select:

```txt
E:\mypage\frontend\dist
```

The extension overrides the new-tab page with `index.html`.

## Local Agent

Dynamic widgets still read the local Agent:

```txt
http://127.0.0.1:3217
```

Start it before using live widgets:

```powershell
cd E:\mypage\agent
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217
```

If the Agent is unavailable, the static start page remains usable. Dynamic widgets should show an unavailable, stale, or sample state.

## Permissions

The current extension build is a static new-tab page. Secrets stay in the local Agent and local environment variables, not in the extension bundle.

Do not put API keys, app passwords, mail account JSON, or OAuth tokens in `frontend/public/` or `frontend/src/`.
