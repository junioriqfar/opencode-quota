OpenCode Quota — Windows

Prerequisites
- PostgreSQL running locally on port 5432, listening on 127.0.0.1 only.
- Dedicated database and user:
    CREATE USER quota_app WITH PASSWORD 'change-me';
    CREATE DATABASE opencode_quota OWNER quota_app;
- URL-encode special characters in the DATABASE_URL password.

1. Extract all files to C:\opencode-quota
2. Copy .env.example to .env and fill:
   - DATABASE_URL (production requires it; there is no fallback)
   - APP_URL (public https:// URL; required in production, ports do not belong in it)
   - PORT (must match the Cloudflared ingress, default 8787 in the sample)
   - SESSION_SECRET, APP_ENCRYPTION_KEY
   - SETUP_TOKEN
   - RESEND_API_KEY, EMAIL_FROM
   - TURNSTILE_SITE_KEY, TURNSTILE_SECRET_KEY
   - NODE_ENV=production, COOKIE_SECURE=true
3. Run quota.exe once.
4. Open http://127.0.0.1:8787/setup and create the super-admin,
   or run:
     quota-cli.exe setup --email you@example.com --password "..." --name "Your Name"
5. Install the Windows service (PowerShell Administrator):
     cd C:\opencode-quota
     .\install-task.ps1 -ServiceUser "PC-KANTOR\svc-quota"
   Without -ServiceUser the task runs as SYSTEM, which has full machine privileges.
6. Add the Cloudflared ingress for the public hostname.

Admin commands (use quota-cli.exe, not quota.exe):
  quota-cli.exe status
  quota-cli.exe sync
  quota-cli.exe migrate:v1 --email you@example.com --group "Example Team"
  quota-cli.exe setup --email you@example.com --password "..." --name "Your Name"

Billing rules:
- One person = one service account = one read-only key in OpenCode Console.
- Map every service account with usage to a member.
- The period must end and a successful sync must run afterwards before finalizing.
- The owner enters the actual IDR bill and finalizes manually. The app never auto-finalizes.
- Finalized bills are frozen; meter cards and quota estimates stay live.
- Finalized periods remain selectable. Reopen if later usage was missed.

Secrets:
- Never share .env.
- Back up APP_ENCRYPTION_KEY separately. Without it, encrypted Console keys cannot be recovered.
- Back up PostgreSQL with pg_dump daily.

Update procedure:
1. Back up first: .\backup.ps1
2. Stop the task:  Stop-ScheduledTask -TaskName "OpenCode Quota"
3. Download the CI artifact or GitHub Release ZIP.
4. Replace quota.exe, quota-cli.exe, public\, and the docs. Keep .env and data\.
5. Start the task:  Start-ScheduledTask -TaskName "OpenCode Quota"
6. Check:  Invoke-RestMethod http://127.0.0.1:8787/api/health

Restore rehearsal (do this once before going live):
1. Create a scratch database:  createdb -h 127.0.0.1 -U postgres opencode_quota_restore
2. & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
     --dbname=postgres://postgres@127.0.0.1:5432/opencode_quota_restore `
     --clean --if-exists "C:\opencode-quota\backup\quota-YYYYMMDD-HHmmss.dump"
3. Point a temporary .env at that database, start quota.exe on another port, and log in.
4. Drop the scratch database when done.
