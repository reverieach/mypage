param(
  [switch] $Install
)

$ErrorActionPreference = "Stop"

$StartAgent = Join-Path $PSScriptRoot "start-agent.ps1"
$StartShare = Join-Path $PSScriptRoot "start-share.ps1"

if ($Install) {
  & $StartAgent -Install
  & $StartShare -Install
}
else {
  & $StartAgent
  & $StartShare
}

