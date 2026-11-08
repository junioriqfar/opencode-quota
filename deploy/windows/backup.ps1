# Run daily (Task Scheduler) after setting PGPASSWORD or using a .pgpass file.
# Adjust the PostgreSQL bin path and database credentials.

$AppDir = "C:\opencode-quota"
$BackupDir = Join-Path $AppDir "backup"
$PgDump = "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe"
$DatabaseUrl = (Get-Content (Join-Path $AppDir ".env") | Where-Object { $_ -match '^DATABASE_URL=' }) -replace '^DATABASE_URL=', ''

if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir | Out-Null }
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Out = Join-Path $BackupDir "quota-$Stamp.dump"

# DATABASE_URL example: postgres://quota_app:password@127.0.0.1:5432/quota_status
$Uri = [System.Uri]$DatabaseUrl
$env:PGPASSWORD = $Uri.UserInfo.Split(':')[1]
& $PgDump -h $Uri.Host -p $Uri.Port -U $Uri.UserInfo.Split(':')[0] -d $Uri.AbsolutePath.TrimStart('/') -Fc -f $Out

# Keep 14 days.
Get-ChildItem $BackupDir -Filter "quota-*.dump" |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-14) } |
  Remove-Item -Force

Write-Host "Backup written to $Out"
