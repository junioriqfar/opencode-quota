OpenCode Quota — Windows

Prerequisites
- PostgreSQL running locally on port 5432.
- Database and user created:
    CREATE USER quota_app WITH PASSWORD 'change-me';
    CREATE DATABASE quota_status OWNER quota_app;
- The same PostgreSQL user is used in DATABASE_URL.

1. Extract all files to C:\opencode-quota
2. Copy .env.example to .env and fill:
   - DATABASE_URL
   - APP_URL (public HTTPS URL)
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
     .\install-task.ps1
6. Add the Cloudflared ingress for the public hostname.

Admin commands (use quota-cli.exe, not quota.exe):
  quota-cli.exe status
  quota-cli.exe sync
  quota-cli.exe migrate:v1 --email you@example.com --group "Example Team"
  quota-cli.exe setup --email you@example.com --password "..." --name "Your Name"

Billing rules:
- One person = one service account = one read-only key in OpenCode Console.
- Map every service account with usage to a member.
- Finalization is blocked while usage is unmapped.
- The owner enters the actual IDR bill and finalizes the period.
- Finalized periods are snapshots; later sync does not change them.

Secrets:
- Never share .env.
- Back up APP_ENCRYPTION_KEY separately. Without it, encrypted Console keys cannot be recovered.
- Back up PostgreSQL with pg_dump daily.
