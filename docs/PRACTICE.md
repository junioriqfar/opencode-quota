# Practice From Scratch

## Identities

Use two separate accounts:

- An **app account** that you create for this practice. It controls groups, members, mapping, and billing.
- Your own **OpenCode Console account**, used only to create a read-only service account key.

Do not put real credentials or personal emails in this file.

## Current environment

- v2 is running at <http://127.0.0.1:8788>.
- v1 is stopped.
- The app uses the practice PostgreSQL database: `opencode_quota`.
- The database may already contain your accounts and groups from earlier practice.
- If `/setup` is still required, create the super-admin first. If setup is already complete, sign in with your existing account.
- Resend/Turnstile are in dev mode: verification/reset links appear in the UI/log. In production those links are never returned to the browser.
- The previous demo database `quota_status` is preserved and backed up in `backups/`.

## Step 1 — Create the super-admin (only if setup is required)

If `/setup` redirects to `/login`, setup is already complete; skip to Step 3.

1. Open <http://127.0.0.1:8788/setup>.
2. Setup token: read `SETUP_TOKEN` from `.env`. In development, if it is empty, the server generates one and prints it once in the server log. Opening `/setup` does **not** rotate the token.
3. Name: your name.
4. Email: your own email address.
5. Choose a strong password: minimal 8 karakter, huruf besar, huruf kecil, angka, dan simbol.
6. Create the super-admin.

Setup only works while the database has no users.

You will land on `/app` with an empty group list.

## Step 2 — Prepare the OpenCode read-only key

Log in to the OpenCode Console with your own Console account.

Recommended: create a dedicated read-only service account key.

1. Settings → Service accounts.
2. Use the existing read-only service account, or create a new one, e.g. `OpenCode Quota`.
3. Add an API key with **Read** / **Read only** permission.
4. Name it something clear, e.g. `Quota Practice`.
5. Copy the key once.

Do **not** use:

- a personal key,
- an inference key,
- an `all` permission key.

The app validates the key and rejects keys that are not read-only service account keys.

If you want to reuse the existing read-only key, it is in:

`~/Projects/BunProjects/quota-status/.env` → `CONSOLE_READ_KEY`

Do not paste it into chat.

## Step 3 — Create a group

1. On `/app`, click **Create group**.
2. Name it, for example **Opencode Go**.
3. You become the owner. The app opens **Manage → Connection** automatically.

## Step 4 — Connect the Console workspace

You should already be on the **Connection** tab. If not, open the group; when no key is connected the app takes you straight there.

1. Paste the read-only key.
2. Click **Verify and connect**.

Expected result:

- Status: `valid`
- Plan: `go`
- Workspace: detected `org_...`
- Last sync populated
- Sync runs automatically

The app will:

- verify `/go/status`,
- verify `/service-accounts`,
- confirm the key is a service account key with `read` permission,
- reject the same Console workspace if it is already connected to another group,
- encrypt the key with AES-256-GCM.

## Step 5 — Review the dashboard

Open the group dashboard.

Check:

- monthly, weekly, 5-hour meters,
- usage share donut,
- daily usage chart,
- member table,
- reconciliation (Go meter vs list cost),
- billing card.

## Step 6 — Invite members

1. Manage → **Members**.
2. Enter an email or leave it empty to generate a one-time link.
3. Create the invite.
4. Copy the link and send it manually (WhatsApp, etc.).
5. The invitee signs up, verifies email, signs in, and accepts the invite.

In dev, the verification link is shown on the signup screen. After verifying, sign in again.

## Step 7 — Map service accounts

1. Manage → **Mapping**.
2. Map every service account with usage to a member.
3. The reader account is automatically excluded.
4. Unmapped accounts with usage block finalization.

## Step 8 — Set the bill and finalize

1. Manage → **Billing**.
2. Select the period.
3. Enter the actual total IDR (for practice: `170000`).
4. Save.
5. After the period ends, click **Sync now** so the final usage is imported.
6. Click **Finalize period**.

Finalization is manual: the app may sync automatically, but the owner must review and click Finalize. The app never auto-finalizes a bill.

Before finalizing, the app checks:

- owner access,
- the period has ended,
- a successful sync happened after the period ended,
- total IDR is set,
- there is usage,
- every service account with usage is mapped.

After finalizing, the bill and daily chart are frozen, while the quota meter cards and per-member quota estimates stay live from the latest sync. Previous periods remain selectable and do not change once finalized.

- member amounts are locked,
- daily chart uses the snapshot,
- new sync does not change the period,
- owner can **Reopen** to return to draft. Reopening also re-syncs the last 90 days.

If a new service account appears after finalization:

1. Reopen the period and wait for the automatic re-sync.
2. Invite the member if needed.
3. Map the new service account.
4. Finalize again.

To see the blocker:

1. Remove the imported member's mapping. Removing a member also revokes their pending email invite.
2. Open Billing.
3. Finalization is blocked with the unmapped account list.
4. Map it again.

## Step 9 — Account menu and super-admin review

Use the account menu in the header to switch theme or change your password. Password changes sign out all other sessions.

Then open **Super-admin** review.

Click **Super-admin** in the header.

Check:

- tenants,
- disable/enable,
- signup policy,
- max groups per user,
- sync health.

## Step 10 — Reset for another practice run

If you want a completely fresh start again, this deletes the current practice accounts and groups:

```bash
dropdb -h 127.0.0.1 -p 5432 -U postgres --if-exists opencode_quota
createdb -h 127.0.0.1 -p 5432 -U postgres opencode_quota
lsof -ti tcp:8788 | xargs -r kill
cd ~/Projects/BunProjects/opencode-quota
nohup bun run start > /tmp/quota-v2-server.log 2>&1 &
```

Then open `/setup` again.

To view the previous demo instead:

1. Change `.env`:
   ```env
   DATABASE_URL=postgres://postgres@127.0.0.1:5432/quota_status
   ```
2. Restart the server.
3. Sign in with an account from that database. If you do not remember one, create a new super-admin with the CLI.

## Before real billing

Follow the production readiness checklist in `README.md`: explicit `DATABASE_URL`, `APP_URL` with `https://`, Turnstile and Resend keys, a dedicated PostgreSQL role, a non-SYSTEM task account, and a rehearsed restore.

## Period rollover (15 Nov 2026)

The current Console cycle is **15 Oct 09:20 → 15 Nov 09:20 WIB**. The period ends at 09:20, not at midnight.

### Prepare — 14 Nov

1. Confirm the period is still **draft** (Manage → Billing). If it was finalized early, **Reopen** it.
2. Set the IDR bill if it is still empty.
3. Map every service account that has usage. Unmapped accounts block finalization.
4. Run a backup:
   ```powershell
   .\backup.ps1
   ```
5. Rehearse the state machine on a throwaway clone:
   ```bash
   createdb -h 127.0.0.1 -U postgres opencode_quota_rehearsal
   pg_dump -h 127.0.0.1 -U postgres -Fc opencode_quota | \
     pg_restore -h 127.0.0.1 -U postgres -d opencode_quota_rehearsal
   DATABASE_URL=postgres://postgres@127.0.0.1:5432/opencode_quota_rehearsal \
     bun scripts/rehearse-rollover.ts
   dropdb -h 127.0.0.1 -U postgres opencode_quota_rehearsal
   ```
   It checks the active-period block, the missing-sync block, finalization, the frozen bill, reopen, and the period selector.

### Roll over — 15 Nov, after 09:20 WIB

1. Click **Sync now**. Wait for it to finish successfully.
2. Open the dashboard and compare with OpenCode Console:
   - monthly meter `used/limit`,
   - per-member list cost and quota estimates,
   - the last day in the daily chart.
3. Check the guard status in Billing. Finalize stays blocked if no successful sync happened after 09:20.
4. Enter the final IDR bill, then click **Finalize period**. This is manual on purpose; the app never auto-finalizes.
5. Confirm the bill is frozen:
   ```bash
   psql "$DATABASE_URL" -c \
     "select start_at, end_at, status, total_idr, finalized_at from periods order by start_at desc;"
   ```
6. Wait for the next sync or click **Sync now** again. The new period **15 Nov → 15 Dec** is created from the Console cycle.
7. Verify:
   - the new period is draft and selected by default,
   - the old period is still selectable in the period selector,
   - the old period's bill and daily chart no longer change after another sync.

### If something looks wrong

- **Finalized too early or values differ from Console:** click **Reopen** on the period. It returns to draft, deletes the snapshot, and the next sync fills in the missing usage.
- **New period missing:** the Console export has not reported it yet. Sync again after a few minutes; the app only creates periods from Console data.
- **Sync failed:** check Manage → Connection for the error. Finalization stays blocked until a sync succeeds after the period end.


## Notes

- App login and OpenCode Console login are separate.
- The app never uses the read-only key for inference.
- The key is never returned to the browser.
- All groups are private; members can see all members and usage inside their group only.
- The current Go cycle is **15 Oct 2026 – 15 Nov 2026**.
- Finalization is blocked until the cycle ends.
