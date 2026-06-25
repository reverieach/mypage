param(
  [switch] $Install
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$AgentDir = Join-Path $RepoRoot "agent"
$PythonExe = Join-Path $AgentDir ".venv\Scripts\python.exe"
$StdoutLog = Join-Path $AgentDir "share-server.log"
$StderrLog = Join-Path $AgentDir "share-server.err.log"
$Port = 3220

function Get-MyPageShareProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "uvicorn" -and
      $_.CommandLine -match "app\.share_main:app" -and
      (
        ($_.CommandLine -like "*$RepoRoot*") -or
        ($_.ExecutablePath -like "$RepoRoot*")
      )
    }
}

function Stop-StaleMyPageShareProcesses {
  param([int[]] $ExceptProcessIds = @())

  $processes = @(Get-MyPageShareProcesses)

  foreach ($shareProcess in $processes) {
    if ($ExceptProcessIds -contains [int] $shareProcess.ProcessId) {
      continue
    }

    Write-Host "Stopping stale MyPage Share process $($shareProcess.ProcessId)..."
    Stop-Process -Id $shareProcess.ProcessId -ErrorAction SilentlyContinue
  }
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if ($existing) {
  Stop-StaleMyPageShareProcesses -ExceptProcessIds @([int] $existing)
  Write-Host "MyPage Share is already running on port $Port as PID $existing."
  exit 0
}

Stop-StaleMyPageShareProcesses

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

Start-Process `
  -FilePath $PythonExe `
  -ArgumentList @("-m", "uvicorn", "app.share_main:app", "--host", "0.0.0.0", "--port", "$Port") `
  -WorkingDirectory $AgentDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $StdoutLog `
  -RedirectStandardError $StderrLog

Start-Sleep -Seconds 2

$started = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty OwningProcess

if (-not $started) {
  throw "MyPage Share did not start. Check $StderrLog"
}

Write-Host "MyPage Share started on http://127.0.0.1:$Port/share as PID $started."
