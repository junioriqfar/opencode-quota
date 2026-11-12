# OpenCode Quota

Private, multi-tenant OpenCode quota and billing dashboard. Each group connects its own OpenCode Console workspace with a read-only service account key, invites members, maps service accounts to people, and finalizes the bill at the end of the period.

The UI, emails, and API messages are in **English**.

## What changed from v1

v1 was a single-workspace dashboard with a public read-only page and admin CLI.

v2 is a multi-tenant application:

- Users sign up, verify email, and create or join groups.
- Passwords use a strength policy; users can change their password from the account menu.
- Turnstile protects login and password reset when configured.
- The group owner connects a read-only Console key.
- The owner invites members and maps service accounts to members.
- Clicking a group without a Console key opens the Connection tab first.
- Owners can rename a group or delete it permanently from Settings.
- Each member row opens a model usage modal: requests, tokens, list cost, and share.
- Only group members can see the group.
- The owner sets the total bill in IDR and finalizes the period.
- Finalization is blocked while any service account with usage is unmapped.
- Scheduled syncs align to wall-clock boundaries.
- A super-admin manages tenants, signup policy, and group limits.

See [`CHANGELOG.md`](CHANGELOG.md) for recent changes.

## Stack

- **Bun + Hono + PostgreSQL**
- **React + Vite + Tailwind + shadCN UI**
  - Button, Input, Label, Select, Card, Table, Tabs, Badge, Alert, Progress, Tooltip, Separator, Skeleton
  - Charts are custom CSS inside shadCN Cards (no chart library)
- **Resend** for transactional email
- **Cloudflare Turnstile** optional in development, recommended in production
- **Cloudflared Tunnel** for public HTTPS without opening inbound ports

## Architecture

```text
Browser (React + shadCN)
  │ session cookie + CSRF token
  ▼
Bun + Hono (127.0.0.1:8788 dev, 127.0.0.1:8787 prod)
  │
  ├── PostgreSQL
  │     users, sessions, groups, group_members, invites,
  │     console_connections (encrypted keys), service_accounts,
  │     account_mappings, periods, usage_daily, meter_snapshots,
  │     period_snapshots, period_daily_snapshots, audit_logs,
  │     sync_runs, app_settings
  │
  └── OpenCode Console API (read-only key per group)
        /go/status
        /service-accounts
        /config
        /v2/usage/export
```

## Roles

| Role | Scope | Can |
|---|---|---|
| **Super-admin** | Application | Manage tenants, disable groups, signup policy, group limit, trigger sync. Cannot read decrypted keys. |
| **Owner** | One group | Connect/rotate Console key, invite/remove members, map service accounts, set bill, finalize/reopen period, view audit. |
| **Member** | One group | View the group dashboard, every member, and all usage in that group. |
| **Unauthenticated** | — | Login, signup, verify email, reset password, invite preview. No data. |

A user can own or join multiple groups. Roles are per group.

## Setup (local development)

### 1. PostgreSQL

A local PostgreSQL server is used. On this machine it runs on `127.0.0.1:5432` (Homebrew PostgreSQL 18):

```bash
createdb -h 127.0.0.1 -p 5432 -U postgres opencode_quota
```

For production, use the existing PostgreSQL on the office PC and create a dedicated user/database:

```sql
CREATE USER quota_app WITH PASSWORD 'change-me';
CREATE DATABASE opencode_quota OWNER quota_app;
```

Keep PostgreSQL listening on localhost only. If the password contains special characters, URL-encode them in `DATABASE_URL`.

### 2. Environment

```bash
cp .env.example .env
```

Generate secrets:

```bash
openssl rand -base64 32   # SESSION_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY
```

Minimum local `.env`:

```env
DATABASE_URL=postgres://postgres@127.0.0.1:5432/opencode_quota
APP_URL=http://127.0.0.1:8788
PORT=8788
HOST=127.0.0.1
NODE_ENV=development
COOKIE_SECURE=false
SESSION_SECRET=...
APP_ENCRYPTION_KEY=...
SETUP_TOKEN=
# In development, leave empty to auto-generate one; it is printed once in the server log.
# In production, set a strong value or setup is disabled.
EMAIL_FROM=OpenCode Quota <noreply@example.com>
RESEND_API_KEY=
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
DEV_EXPOSE_EMAIL_LINKS=true
SYNC_INTERVAL_MS=600000
PLAN_PRICE_USD=10
V1_DB_PATH=../quota-status/data/quota.db
```

With `RESEND_API_KEY` and Turnstile empty, verification/reset links are logged and returned to the UI in development. Set all keys for production and set `DEV_EXPOSE_EMAIL_LINKS=false`.

### 3. Install and run

```bash
bun install
bun run build:web
bun run start
```

Open <http://127.0.0.1:8788>.

### 4. First super-admin

Option A: UI setup

1. Open `/setup`.
2. Enter `SETUP_TOKEN`, name, email, password.
3. The account becomes super-admin.

Setup is only available while the `users` table is empty. Concurrent setup attempts are serialized, so only one account can win. If `SETUP_TOKEN` is empty in development, a token is generated and printed **once** in the server log; opening `/setup` does not rotate it. In production, set `SETUP_TOKEN` explicitly or setup stays disabled.

Option B: CLI

```bash
bun run cli setup --email you@example.com --password 'strong-password' --name 'Your Name'
```

For local development only:

```bash
bun run cli seed:dev
# Super-admin email: admin@example.test
# Password: generated and printed once, or set SEED_ADMIN_PASSWORD
```

Never commit `.env`, generated passwords, or screenshots that contain real usage data.

## Resend

1. Create a Resend account and API key.
2. Verify the sending domain or use Resend's test sender.
3. Set `RESEND_API_KEY` and `EMAIL_FROM`.
4. Email verification and password reset use Resend.

If Resend is not configured, the app logs email content and (in development) returns the link in the API/UI.

## Cloudflare Turnstile

1. Create a Turnstile widget in Cloudflare.
2. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
3. Set `APP_URL` to the exact public HTTPS URL.

In development, an empty secret bypasses verification. In production, both Turnstile keys are required and the server refuses to start without them.

## Main flows

### Create a group

1. Sign up, verify email, sign in.
2. Create a group (subject to the super-admin's per-user group limit).
3. The creator becomes the owner.

### Connect OpenCode

1. In OpenCode Console, create a **dedicated service account** with a **read-only** key.
2. Paste the key in **Manage → Connection**.
3. The app verifies:
   - `/go/status` works,
   - `/service-accounts` works,
   - the key is a service account key,
   - permission is `read` (not `all`),
   - the Console workspace is not already connected to another group.
4. The key is encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`; only the sync worker decrypts it.
5. The first sync creates the period and imports usage.

### Invite members

- Owner creates an invite by email or link.
- Email invites are sent by Resend; link invites are copied manually.
- If the invited email already has an account, the invite also appears on that member's `/app` page as a pending invitation, so they can accept it without opening the link.
- The invitee signs in with the invited email and accepts.
- Members can see all members and usage in the group.

### Map service accounts

- The mapping page lists every service account from the Console export.
- Map each service account to an active member.
- A member can have multiple service accounts.
- The reader account (the app's own read-only key) is auto-excluded.
- **Unmapped accounts with usage block finalization.**

### Billing and finalization

- The owner enters the actual total bill in IDR (including tax/fees).
- The bill is split by **list cost share** using largest remainder.
- Finalization requires:
  - owner access,
  - the period to have ended,
  - a successful sync after the period ended,
  - a total IDR bill,
  - at least one usage row,
  - no unmapped service account with usage.
- Finalization stores:
  - member totals,
  - daily member snapshots,
  - mapping-independent amounts.
- After finalization, sync ignores new usage for that period and does not modify the finalized period window or plan price. The bill and daily chart are frozen, while the quota meter cards stay live from the latest sync so used/limit and percentage remain consistent.
- The owner can reopen a finalized period. Reopening deletes the snapshot, returns to draft, and **re-syncs the last 90 days** so late service-account usage is imported.
- Previous periods stay available in the period selector. Once finalized, the bill, daily chart, usage attribution, and meter snapshot for that period do not change.
- If a legacy period was finalized before its end date, the dashboard warns that later usage is missing and the owner can reopen it.
- Meter cards and per-member quota estimates remain live from the latest Console snapshot so they match OpenCode Console; only billing values are frozen.

### New service account after finalization

If a service account is created or used after the period was finalized:

1. **Reopen** the period. The app re-syncs the last 90 days automatically.
2. Invite the member if the service account belongs to a new person.
3. Map the service account.
4. **Finalize** again.

Without reopening, usage that falls inside the finalized period is not imported. The 90-day re-sync covers a normal OpenCode Go cycle (about 30–31 days).

### Period boundaries

- Periods follow `access.startsAt` / `access.endsAt` from OpenCode Go.
- Usage is assigned by date range `[start_date, end_date)`.
- The reset day belongs to the next period.

## API

All endpoints are JSON and require a session cookie unless noted.

### Public

- `GET /api/auth/config` — app config, Turnstile site key, signup state, setup state.
- `GET /api/health` — database health.
- `GET /api/invites/:token` — invite preview.

### Auth

- `POST /api/auth/signup` — name, email, password, Turnstile token.
- `GET /api/auth/verify?token=` — verify email only; the user then signs in.
- `POST /api/auth/login` — email, password.
- `POST /api/auth/logout`
- `GET /api/auth/me` — current user + CSRF token.
- `POST /api/auth/change-password` — current + new password; signs out all other sessions.
- `POST /api/auth/resend-verification`
- `POST /api/auth/forgot`
- `POST /api/auth/reset`
- `GET /api/auth/setup/status`
- `POST /api/auth/setup`

### Groups

- `GET /api/groups`
- `POST /api/groups`
- `GET /api/groups/:id`
- `GET /api/groups/:id/summary?periodId=`
- `GET /api/groups/:id/history?periodId=&days=`
- `GET /api/groups/:id/periods`
- `GET /api/groups/:id/members`
- `GET /api/groups/:id/members/:userId/usage?periodId=`
- `DELETE /api/groups/:id/members/:userId`
- `DELETE /api/groups/:id/me`
- `GET/POST/DELETE /api/groups/:id/invites`
- `POST /api/invites/:token/accept`
- `GET /api/invites` — pending invitations addressed to the signed-in user's email.
- `POST /api/invites/accept` — accept a pending email invitation by id; body `{ "inviteId": "..." }`.
- `GET/PUT/DELETE /api/groups/:id/console`
- `POST /api/groups/:id/sync`
- `GET /api/groups/:id/service-accounts?periodId=`
- `PUT/DELETE /api/groups/:id/mappings/:accountId`
- `PUT /api/groups/:id/periods/:periodId/bill`
- `POST /api/groups/:id/periods/:periodId/finalize`
- `POST /api/groups/:id/periods/:periodId/reopen`
- `GET /api/groups/:id/audit`
- `PATCH /api/groups/:id` — rename (confirm-free, owner only)
- `DELETE /api/groups/:id` — delete permanently; body `{ "confirmName": "<exact name>" }`

### Super-admin

- `GET /api/admin/groups`
- `GET/PUT /api/admin/settings`
- `POST /api/admin/groups/:id/disable|enable`
- `POST /api/admin/groups/:id/sync`
- `GET /api/admin/health`

Mutations require `X-CSRF-Token` from `/api/auth/me` and a matching Origin.

## Security

- Passwords: Argon2id via `Bun.password`.
- Password policy: at least 8 characters with an uppercase letter, a lowercase letter, a number, and a symbol. Enforced on signup, setup, password reset, change-password, and CLI setup.
- Development email-link disclosure is forced off when `NODE_ENV=production`.
- Invitation emails HTML-escape user-supplied group names and strip control characters from subjects.
- Password change and reset invalidate outstanding reset/verify tokens and sign out other sessions.
- CLI `setup` supports `--password-stdin` or `OPENCODE_QUOTA_PASSWORD` to keep passwords out of shell history.
- Email verification does not create a session; users sign in after verifying.
- Sessions: random 32-byte token, SHA-256 hash in DB, HttpOnly/Secure/SameSite cookie.
- CSRF: per-session token + Origin check.
- Email tokens: one-time, hashed in DB, short expiry.
- Rate limits: login, signup, reset, invite, sync, setup. Budgets are stored in PostgreSQL so they survive restarts; login, signup, forgot, and reset are checked before body parsing, and body size is capped at 1 MB.
- Account enumeration: unknown-email logins run a dummy Argon2 verification, and signup returns a generic response for existing addresses.
- Finalization: only after the period ends; finalized rows are never mutated by later syncs.
- Turnstile: required in production (server refuses to start without both keys); only bypassed in development.
- Setup guard: only when the `users` table is empty; a table lock serializes concurrent setup requests.
- Setup token: static from `SETUP_TOKEN`; in development an empty value generates one stable token and logs it once. Page access never rotates it.
- Turnstile server-side verification when configured; required in production.
- Production sessions use the `__Host-qs_session` cookie, HSTS, and `Cache-Control: no-store` on API responses.
- Dependency audit is clean after upgrading React Router, Vite, and Zod.
- Windows backup script verifies `pg_dump` before pruning and tightens backup-directory ACLs.
- Console keys: AES-256-GCM with per-record nonce and `group_id` AAD; never returned to the browser. Ambiguous key matches are rejected.
- Disabled groups are excluded from scheduled syncs.
- Invitations: pending duplicates are rejected, and pending invites are revoked when a member is removed or leaves.
- Logs: recipients are masked, email bodies/tokens are not logged, and production error logs omit full error objects.
- Tenant isolation: every group query is scoped by `group_id` and membership checks.
- Super-admin cannot decrypt keys.
- Audit log for group, key, invite, mapping, billing, and admin actions.
- Security headers: CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, noindex.

### Security review status

A read-only security review covered auth, tenant isolation, Console key handling, sync/billing integrity, input handling, headers, deployment scripts, and dependencies. Implemented hardening includes: production-only email-link disclosure off, required production Turnstile, HTML-escaped invite emails, sanitized auth redirects, setup/reset/CLI password policy, finalized-period immutability, dummy Argon2 timing equalization, persistent per-IP rate limits, token invalidation on password changes, no session on email verification, `__Host-` production cookie, HSTS, no-store API responses, and a clean `bun audit`.

### Public repository hygiene

- `.env`, `.env.*` are git-ignored; only `.env.example` is committed.
- `backups/`, `dist/`, `public/`, and `docs/screenshots/` are git-ignored because they can contain dumps, built artifacts, real names, or usage data.
- Never commit generated `SESSION_SECRET`, `APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, or `RESEND_API_KEY`.
- If a secret was ever shared or committed, rotate it. Deleting the file is not enough once it is in git history.
- Database dumps may contain password hashes, sessions, and encrypted Console keys. Keep them private.

## Deployment to Windows

Build:

```bash
bun run build:win
```

Output:

```text
dist/quota.exe       # server
dist/quota-cli.exe   # admin CLI
dist/quota-windows.zip  # prebuilt package (server + CLI + public + deploy files)
public/
.env
deploy/windows/start.bat
deploy/windows/install-task.ps1
deploy/windows/backup.ps1
```

On the office PC:

```text
C:\opencode-quota\
├── quota.exe
├── quota-cli.exe
├── public\
├── .env
├── start.bat
└── data\            (optional; app data lives in PostgreSQL)
```

Production `.env`:

```env
DATABASE_URL=postgres://quota_app:change-me@127.0.0.1:5432/opencode_quota
APP_URL=https://quota.example.com
PORT=8787
HOST=127.0.0.1
NODE_ENV=production
COOKIE_SECURE=true
SESSION_SECRET=...
APP_ENCRYPTION_KEY=...
SETUP_TOKEN=...
EMAIL_FROM=OpenCode Quota <noreply@example.com>
RESEND_API_KEY=...
TURNSTILE_SITE_KEY=...
TURNSTILE_SECRET_KEY=...
DEV_EXPOSE_EMAIL_LINKS=false
SYNC_INTERVAL_MS=600000
PLAN_PRICE_USD=10
```

Run `quota.exe` once, finish `/setup`, then install as a service:

```powershell
cd C:\opencode-quota
.\install-task.ps1
```

Admin commands use `quota-cli.exe`:

```bat
quota-cli.exe setup --email you@example.com --password "..." --name "Your Name"
quota-cli.exe migrate:v1 --email you@example.com --group "Example Team"
quota-cli.exe status
quota-cli.exe sync
```

Do not run `quota.exe sync`; use `quota-cli.exe sync`.

## Cloudflared

Add the public hostname before the catch-all in `config.yml`:

```yaml
ingress:
  - hostname: quota.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Then:

```bash
cloudflared tunnel route dns <tunnel-name> quota.example.com
cloudflared service restart
```

Set `APP_URL=https://quota.example.com` exactly. If using a different hostname, update both Cloudflared and `APP_URL`.

## Production readiness checklist

Run this once on the office PC before real billing starts.

### Configuration

- [ ] `NODE_ENV=production` and `HOST=127.0.0.1`
- [ ] `DATABASE_URL` is set explicitly. Production refuses to start without it.
- [ ] `APP_URL` is the exact `https://` hostname served by Cloudflared. Production refuses a plain `http://` URL because the `__Host-` cookie requires a secure origin.
- [ ] `SESSION_SECRET` and `APP_ENCRYPTION_KEY` are 32-byte base64 values, stored in a password manager.
- [ ] `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are set. Startup fails without them.
- [ ] `RESEND_API_KEY` and `EMAIL_FROM` are set. Without Resend, verification and password-reset emails are not delivered.
- [ ] `SETUP_TOKEN` is set before `/setup`. Setup closes permanently once a user exists.
- [ ] `PORT` matches the Cloudflared ingress target.

### Database

- [ ] PostgreSQL listens on localhost only (`listen_addresses = 'localhost'`).
- [ ] The app connects as a dedicated non-superuser role that owns only `opencode_quota`.
- [ ] `deploy/windows/backup.ps1` runs daily and prunes dumps older than 14 days.
- [ ] A restore has been rehearsed into a scratch database:

  ```powershell
  createdb -h 127.0.0.1 -U postgres opencode_quota_restore
  & "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" `
    --dbname=postgres://postgres@127.0.0.1:5432/opencode_quota_restore `
    --clean --if-exists "C:\opencode-quota\backup\quota-YYYYMMDD-HHmmss.dump"
  ```

  Point a temporary `.env` at the scratch database, start on another port, and log in.

### Host

- [ ] The scheduled task runs as a dedicated account, not SYSTEM: `.\install-task.ps1 -ServiceUser "PC-KANTOR\svc-quota"`.
- [ ] Only Cloudflared reaches the app; no inbound ports are opened on the router.
- [ ] Health check returns `{"ok":true,"database":"ok"}` after a reboot.

### Trust boundary

Client IPs for rate limiting come from `cf-connecting-ip` / `x-forwarded-for`. Keep `HOST=127.0.0.1` so only Cloudflared can reach the app. If you ever bind to a LAN address, make the proxy strip those headers; otherwise callers can spoof their IP and bypass per-IP limits. The server warns at startup when `HOST` is not loopback.

## Migrating v1 data

The v1 app stores usage in `../quota-status/data/quota.db`.

1. Create the super-admin (setup).
2. Run:

```bash
bun run cli migrate:v1 --email you@example.com --group "Example Team"
```

It:

- creates the group,
- imports the latest period, service accounts, usage, and meter snapshot,
- maps the `API` service account to the owner,
- creates a pending invite link for the imported member,
- leaves that member's service account unmapped.

Send the printed invite link to the member. After they accept, map their service account. Finalization stays blocked until then.

On Windows, copy the v1 `quota.db` to the PC, set `V1_DB_PATH` to it, and run `quota-cli.exe migrate:v1`.

## Backup

PostgreSQL is the source of truth. Backup with `pg_dump` daily:

```powershell
$env:PGPASSWORD="change-me"
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" `
  -h 127.0.0.1 -U quota_app -d opencode_quota -Fc `
  -f "C:\opencode-quota\backup\quota-$(Get-Date -Format yyyyMMdd-HHmmss).dump"
```

Keep the `APP_ENCRYPTION_KEY` separately. Without it, encrypted Console keys cannot be recovered.

## Development notes

- v1 is still at `http://127.0.0.1:8787`; v2 is at `http://127.0.0.1:8788`.
- The current `.env` points to the practice database: `opencode_quota`.
- It may already contain your accounts and groups. Use `/login` if setup is complete; use `/setup` with the setup token only if setup is still required.
- Use your own app account and OpenCode Console account. Do not commit `.env`, database dumps, or screenshots that show real usage data.
- The previous demo database is `quota_status` and is backed up under `backups/` (git-ignored).
- Follow `PRACTICE.md` for the full from-scratch flow.
- Resend and Turnstile are empty; emails are logged and links are exposed in dev.
- `DEV_EXPOSE_EMAIL_LINKS=true` is ignored in production; dev links are only returned in development.

## Tests

```bash
bun test
bunx tsc --noEmit
bunx tsc -p web/tsconfig.json --noEmit
bun run build:web
bun run build:win
```

## CI

`.github/workflows/ci.yml` runs on GitHub Actions for pushes, pull requests, and version tags:

- install dependencies with `bun install --frozen-lockfile`
- typecheck backend and web
- run tests
- run `bun audit`
- build frontend and Windows executables
- upload `quota-windows.zip` as a downloadable artifact

Pushing a tag like `v2.1.0` also attaches the ZIP to a GitHub Release. Deployment to the office Windows PC is manual: download the artifact/release, back up PostgreSQL, stop the service, replace the executables and `public/`, then start it again. GitHub-hosted runners cannot reach a private office PC directly.

## Known limitations

- Usage attribution is per **service account**, not per API key. Use one service account per person.
- A Console workspace can be connected to only one group. Create a new group for a different workspace.
- Finalization is owner-only, available only after the period ends, and blocked until all usage accounts are mapped. It is intentionally manual: the app may auto-sync, but it never auto-finalizes a bill.
- Open signup is rate-limited and guarded by email verification/Turnstile; for a small friend group, consider a signup code or approval later.
- The app does not implement password reset via manual admin action; Resend (or dev logs) is required.
- Notifications are shown in-app as dashboard warnings and admin status; no email/WhatsApp delivery is implemented.
