# Browser Extension

MyPage can be loaded as a Chrome or Edge new-tab extension after building the frontend.

## Build

```bash
cd frontend
npm run build
```

## Load In Chrome Or Edge

1. Open the extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable developer mode.
3. Choose "Load unpacked".
4. Select `E:\mypage\frontend\dist`.

The extension overrides the new-tab page with `index.html`.

## Local Agent

Dynamic widgets read `http://127.0.0.1:3217/*`. Start the Agent before opening a new tab if you want live widget data:

```bash
cd agent
.\.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 3217
```

When the Agent is not running, widgets show their unavailable state and the rest of the start page remains usable.
