# Message Pipeline

The local Agent has a reusable message pipeline. Mail is the first source; future
sources such as GitHub issues, Bilibili messages, and school notices can produce
the same notification records.

## Configuration

Mail accounts can be configured with either:

- `MAIL_ACCOUNTS_JSON`, a JSON array in an environment variable.
- `agent/app/data/mail_accounts.json`, copied from `agent/mail_accounts.example.json`.

Secrets should be provided through environment variables referenced by
`passwordEnv`. Do not commit real mail credentials or API keys.

Outlook / Microsoft accounts should use `provider: "microsoft_graph"` instead
of IMAP when basic auth fails. Configure a Microsoft Entra app client id:

```powershell
$env:MICROSOFT_GRAPH_CLIENT_ID="..."
```

Then start device-code authorization:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3217/api/mail/microsoft/device/start"
```

Open the returned `verificationUri`, enter `userCode`, then poll once the browser
authorization is complete:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3217/api/mail/microsoft/device/poll?account_id=outlook-main&device_code=PASTE_DEVICE_CODE"
```

The resulting refresh token is stored locally in `agent/app/data/oauth_tokens.json`,
which is ignored by Git.

DeepSeek settings:

```powershell
$env:DEEPSEEK_API_KEY="..."
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
$env:DEEPSEEK_MODEL="deepseek-chat"
```

If `DEEPSEEK_API_KEY` is missing, the Agent falls back to a local keyword
classifier so the UI remains usable.

## API

- `POST /api/mail/refresh` manually syncs configured IMAP accounts and analyzes
  new messages.
- `GET /api/mail/summary` returns account sync state and analyzed mail items for
  the dedicated Mail widget.
- `GET /api/notifications` returns important items from the shared notification
  pipeline. Important mail appears here too.
- `GET /api/mail/microsoft/status` shows configured Microsoft Graph accounts and
  whether they already have local OAuth tokens.
- `POST /api/mail/microsoft/device/start` starts Microsoft device-code auth.
- `POST /api/mail/microsoft/device/poll` completes Microsoft device-code auth.

The Agent also starts a background mail sync loop. Its interval is controlled by
`MAIL_SYNC_INTERVAL_SECONDS` and defaults to 900 seconds. Set it to `0` to disable
automatic sync and rely only on manual refresh.

The first implementation is read-only: it does not reply, delete, archive, or
mark messages.
