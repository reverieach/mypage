$ErrorActionPreference = "Stop"

$TaskName = "MyPage Local Agent"
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "MyPage Local Agent.lnk"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed startup task: $TaskName"
}
else {
  Write-Host "Startup task is not installed: $TaskName"
}

if (Test-Path $ShortcutPath) {
  Remove-Item -LiteralPath $ShortcutPath
  Write-Host "Removed startup shortcut: $ShortcutPath"
}
