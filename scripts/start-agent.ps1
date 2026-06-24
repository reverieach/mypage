param(
  [switch] $Install
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AgentDir = Join-Path $RepoRoot "agent"
$PythonExe = Join-Path $AgentDir ".venv\Scripts\python.exe"
$StdoutLog = Join-Path $AgentDir "agent-server.log"
$StderrLog = Join-Path $AgentDir "agent-server.err.log"
$Port = 3217

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if ($existing) {
  Write-Host "MyPage Agent is already running on port $Port as PID $existing."
  exit 0
}

if (-not (Test-Path $PythonExe)) {
  if (-not $Install) {
    throw "Agent venv is missing. Run: scripts\start-agent.ps1 -Install"
  }

  Push-Location $AgentDir
  try {
    python -m venv .venv
    & $PythonExe -m pip install -r requirements.txt
  }
  finally {
    Pop-Location
  }
}

$env:QQ_MAIL_AUTH_CODE = [Environment]::GetEnvironmentVariable("QQ_MAIL_AUTH_CODE", "User")
$env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable("DEEPSEEK_API_KEY", "User")
$env:OUTLOOK_MAIL_APP_PASSWORD = [Environment]::GetEnvironmentVariable("OUTLOOK_MAIL_APP_PASSWORD", "User")

Start-Process `
  -FilePath $PythonExe `
  -ArgumentList @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "$Port") `
  -WorkingDirectory $AgentDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog

Start-Sleep -Seconds 2

$started = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if (-not $started) {
  throw "MyPage Agent did not start. Check $StderrLog"
}

Write-Host "MyPage Agent started on http://127.0.0.1:$Port/ as PID $started."
