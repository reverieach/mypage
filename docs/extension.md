# Browser Extension

MyPage can be loaded as a Chrome or Edge new-tab extension after building the frontend.

## Build

```powershell
cd E:\mypage
.\scripts\build-extension.ps1
```

This writes:

```txt
E:\mypage\frontend\dist
E:\mypage\release\mypage-extension.zip
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

## Startup Page

Browser startup pages are separate from new-tab overrides. Use the Agent-hosted production URL for startup:

```txt
http://127.0.0.1:3217/
```

Chrome:

1. Open `chrome://settings/onStartup`.
2. Choose "Open a specific page or set of pages".
3. Add `http://127.0.0.1:3217/`.

Edge:

1. Open `edge://settings/startHomeNTP`.
2. Under "When Edge starts", choose opening specific pages.
3. Add `http://127.0.0.1:3217/`.

The Agent must be running before the browser starts if you want dynamic widgets immediately available.

## Local Agent

Dynamic widgets still read the local Agent:

```txt
http://127.0.0.1:3217
```

Start it before using live widgets:

```powershell
cd E:\mypage
.\scripts\start-agent.ps1
```

Optional login startup task:

```powershell
.\scripts\install-startup-task.ps1
```

Remove it:

```powershell
.\scripts\uninstall-startup-task.ps1
```

If the Agent is unavailable, the static start page remains usable. Dynamic widgets should show an unavailable, stale, or sample state.

## Permissions

The current extension build is a static new-tab page. Secrets stay in the local Agent and local environment variables, not in the extension bundle.

Do not put API keys, app passwords, mail account JSON, or OAuth tokens in `frontend/public/` or `frontend/src/`.
