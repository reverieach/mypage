$ErrorActionPreference = "Stop"

$Port = 3217
$connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
$pids = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)

if (-not $pids -or $pids.Count -eq 0) {
  Write-Host "MyPage Agent is not listening on port $Port."
  exit 0
}

foreach ($pidValue in $pids) {
  $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue

  if (-not $process) {
    continue
  }

  Write-Host "Stopping MyPage Agent process $pidValue ($($process.ProcessName))..."
  Stop-Process -Id $pidValue
}
