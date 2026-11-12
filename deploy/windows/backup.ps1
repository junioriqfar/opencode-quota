# Run daily (Task Scheduler) after setting up a .pgpass file or PGPASSWORD.
# Adjust the PostgreSQL bin path if needed.
# SECURITY: dumps contain password hashes, sessions, emails, and encrypted
# Console keys. Keep this directory private; do not sync it to cloud storage.

$ErrorActionPreference = "Stop"

$AppDir = "C:\opencode-quota"
$BackupDir = Join-Path $AppDir "backup"
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$DatabaseUrl = ((Get-Content (Join-Path $AppDir ".env") | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', '').Trim()

if (-not $DatabaseUrl) { throw "DATABASE_URL not found in $AppDir\.env" }
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }

try {
  icacls $BackupDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" /grant:r "SYSTEM:(OI)(CI)F" | Out-Null
} catch {
  Write-Warning "Could not tighten backup directory ACL. Verify permissions manually."
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $BackupDir "quota-$Stamp.dump"

# Pass the connection URI straight to pg_dump so passwords with @ or : work,
# as long as they are percent-encoded in DATABASE_URL.
& $PgDump --dbname=$DatabaseUrl -Fc -f $Out
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Out) -or (Get-Item $Out).Length -eq 0) {
  throw "pg_dump failed (exit $LASTEXITCODE). Existing backups were NOT pruned."
}

# Keep 14 days only after a successful dump.
Get-ChildItem $BackupDir -Filter "quota-*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force

Write-Host "Backup written to $Out"
