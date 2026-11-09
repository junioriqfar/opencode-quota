# Run as Administrator in PowerShell.
# Edit $AppDir if the app is not in C:\opencode-quota.
$AppDir = "C:\opencode-quota"
$TaskName = "OpenCode Quota"

if (-not (Test-Path "$AppDir\quota.exe")) {
  throw "quota.exe not found in $AppDir. Extract the build first."
}
if (-not (Test-Path "$AppDir\.env")) {
  throw ".env not found in $AppDir. Configure PostgreSQL, secrets, Resend, and Turnstile first."
}

$Action = New-ScheduledTaskAction -Execute "$AppDir\quota.exe" -WorkingDirectory $AppDir
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -RunLevel Highest `
  -User "SYSTEM" `
  -Force

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
Write-Host "Service installed. Check: http://127.0.0.1:8787/api/health"
