$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $RepoRoot "scripts\start-agent.ps1"
$TaskName = "MyPage Local Agent"
$StartupDir = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $StartupDir "MyPage Local Agent.lnk"
$Action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $Action `
    -Trigger $Trigger `
    -Principal $Principal `
    -Description "Start MyPage local Agent on login." `
    -Force | Out-Null

  Write-Host "Installed startup task: $TaskName"
}
catch {
  Write-Host "Scheduled task install failed; falling back to Startup folder shortcut."
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($ShortcutPath)
  $shortcut.TargetPath = "powershell.exe"
  $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`""
  $shortcut.WorkingDirectory = $RepoRoot
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Start MyPage local Agent on login."
  $shortcut.Save()
  Write-Host "Installed startup shortcut: $ShortcutPath"
}
