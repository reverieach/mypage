$ErrorActionPreference = "Stop"

$StopScript = Join-Path $PSScriptRoot "stop-agent.ps1"
$StartScript = Join-Path $PSScriptRoot "start-agent.ps1"

& $StopScript
Start-Sleep -Milliseconds 800
& $StartScript
