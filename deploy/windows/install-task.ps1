# Run as Administrator in PowerShell.
# Usage:
#   .\install-task.ps1
#     -> runs as SYSTEM (convenient, but SYSTEM has full machine privileges)
#   .\install-task.ps1 -ServiceUser "PC-KANTOR\svc-quota"
#     -> runs as a dedicated low-privilege account; you will be prompted for its password
#
# For the hardened setup, create the account first:
#   net user svc-quota "<strong-password>" /add /passwordchk /comment:"OpenCode Quota service"
#   net localgroup "Log on as a batch job" svc-quota /add   # or grant via secpol.msc
# The script grants Modify on $AppDir so the account can read .env and write logs.

param(
  [string]$AppDir = "C:\opencode-quota",
  [string]$ServiceUser = "SYSTEM"
)

$ErrorActionPreference = "Stop"
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

if ($ServiceUser -eq "SYSTEM") {
  Write-Warning @"
Running as SYSTEM gives the app full machine privileges.
For a hardened deployment, create a dedicated account and re-run:
  .\install-task.ps1 -ServiceUser "$env:COMPUTERNAME\svc-quota"
"@
  $CredentialArgs = @{ User = "SYSTEM" }
} else {
  $Credential = Get-Credential -UserName $ServiceUser `
    -Message "Windows password for $ServiceUser (required to start the task at boot)"
  $CredentialArgs = @{
    User = $Credential.UserName
    Password = $Credential.GetNetworkCredential().Password
  }
  # The service account needs read/write on the app directory (read .env, write data).
  try {
    icacls $AppDir /grant "$($Credential.UserName):(OI)(CI)M" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls exited $LASTEXITCODE" }
  } catch {
    Write-Warning "Could not grant Modify on $AppDir to $($Credential.UserName). Verify ACLs manually."
  }
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -RunLevel Highest `
  @CredentialArgs `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
$Port = ((Get-Content (Join-Path $AppDir ".env") | Where-Object { $_ -match '^PORT=' }) -replace '^PORT=', '')
if (-not $Port) { $Port = "8788" }
Write-Host "Service installed as $ServiceUser. Check: http://127.0.0.1:$Port/api/health"
