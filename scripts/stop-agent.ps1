$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$Port = 3217
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

function Get-MyPageAgentProcesses {
  Get-CimInstance Win32_Process |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "uvicorn" -and
      $_.CommandLine -match "app\.main:app" -and
      (
        ($_.CommandLine -like "*$RepoRoot*") -or
        ($_.ExecutablePath -like "$RepoRoot*")
      )
    }
}

$allProcessIds = @($pids)
$allProcessIds += @(Get-MyPageAgentProcesses | Select-Object -ExpandProperty ProcessId)
$allProcessIds = @($allProcessIds | Where-Object { $_ } | Select-Object -Unique)

if (-not $allProcessIds -or $allProcessIds.Count -eq 0) {
  Write-Host "MyPage Agent is not running."
  exit 0
}

foreach ($pidValue in $allProcessIds) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue

  if (-not $process) {
    continue
  }

  Write-Host "Stopping MyPage Agent process $pidValue ($($process.ProcessName))..."
  Stop-Process -Id $pidValue
}
