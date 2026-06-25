$ErrorActionPreference = "Stop"

$StopScript = Join-Path $PSScriptRoot "stop-share.ps1"
$StartScript = Join-Path $PSScriptRoot "start-share.ps1"

& $StopScript
Start-Sleep -Milliseconds 800
& $StartScript
