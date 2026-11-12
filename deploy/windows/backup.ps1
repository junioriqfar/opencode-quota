# Run daily (Task Scheduler) after setting PGPASSWORD or using a .pgpass file.
# Adjust the PostgreSQL bin path and database credentials.
# SECURITY: dumps contain password hashes, sessions, emails, and encrypted
# Console keys. Keep this directory private; do not sync it to cloud storage.

$AppDir = "C:\opencode-quota"
$BackupDir = Join-Path $AppDir "backup"
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$DatabaseUrl = (Get-Content (Join-Path $AppDir ".env") | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', ''

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
try {
  icacls $BackupDir /inheritance:r /grant:r "$env:USERNAME:(OI)(CI)F" /grant:r "SYSTEM:(OI)(CI)F" | Out-Null
} catch {
  Write-Warning "Could not tighten backup directory ACL. Verify permissions manually."
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $BackupDir "quota-$Stamp.dump"

# DATABASE_URL example: postgres://quota_app:password@127.0.0.1:5432/quota_status
$Uri = [System.Uri]$DatabaseUrl
$env:PGPASSWORD = $Uri.UserInfo.Split(':')[1]
& $PgDump -h $Uri.Host -p $Uri.Port -U $Uri.UserInfo.Split(':')[0] -d $Uri.AbsolutePath.TrimStart('/') -Fc -f $Out

if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Out) -or (Get-Item $Out).Length -eq 0) {
  throw "pg_dump failed (exit $LASTEXITCODE). Existing backups were NOT pruned."
}

# Keep 14 days only after a successful dump.
Get-ChildItem $BackupDir -Filter "quota-*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force

Write-Host "Backup written to $Out"
