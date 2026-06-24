# Local Release Checklist

This checklist prepares MyPage for personal Chrome/Edge daily use.

## Build

```powershell
cd E:\mypage
.\scripts\build-extension.ps1
```

Expected outputs:

- `frontend/dist/`
- `release/mypage-extension.zip`

## Start Agent

```powershell
.\scripts\start-agent.ps1
```

Open:

```txt
http://127.0.0.1:3217/
```

## Verify

```powershell
.\scripts\smoke-test.ps1
```

Optional live refresh checks:

```powershell
.\scripts\smoke-test.ps1 -Full
```

## New Tab

Load the unpacked extension:

- Chrome: `chrome://extensions`
- Edge: `edge://extensions`

Enable developer mode, choose "Load unpacked", and select:

```txt
E:\mypage\frontend\dist
```

## Startup Page

Set the browser startup page to:

```txt
http://127.0.0.1:3217/
```

This is separate from the extension new-tab override.

## Optional Login Startup

Install the Agent login task:

```powershell
.\scripts\install-startup-task.ps1
```

Remove it:

```powershell
.\scripts\uninstall-startup-task.ps1
```

## Do Not Commit

- `frontend/dist/`
- `release/`
- `agent/app/data/*.json`
- `agent/app/data/*.sqlite3`
- `agent/app/data/link-icons/`
- `agent/app/data/wallpapers/`
- `agent/*.log`
