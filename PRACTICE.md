# Practice From Scratch

## Identities

Use two separate accounts:

- An **app account** that you create for this practice. It controls groups, members, mapping, and billing.
- Your own **OpenCode Console account**, used only to create a read-only service account key.

Do not put real credentials or personal emails in this file.

## Current environment

- v2 is running at <http://127.0.0.1:8788>.
- v1 is stopped.
- The app uses the practice PostgreSQL database: `quota_status_practice`.
- The database may already contain your accounts and groups from earlier practice.
- If `/setup` is still required, create the super-admin first. If setup is already complete, sign in with your existing account.
- Resend/Turnstile are in dev mode: verification/reset links appear in the UI/log.
- The previous demo database `quota_status` is preserved and backed up in `backups/`.

## Step 1 — Create the super-admin (only if setup is required)

If `/setup` redirects to `/login`, setup is already complete; skip to Step 3.

1. Open <http://127.0.0.1:8788/setup>.
2. Setup token: read `SETUP_TOKEN` from your local `.env` (never commit `.env`).
3. Name: your name.
4. Email: your own email address.
5. Choose a strong password.
6. Create the super-admin.

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
5. The invitee signs up, verifies email, signs in, and accepts.

In dev, the verification link is shown on the signup screen.

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
5. Click **Finalize period**.

Before finalizing, the app checks:

- owner access,
- total IDR is set,
- there is usage,
- every service account with usage is mapped.

After finalizing:

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

1. Remove the imported member's mapping.
2. Open Billing.
3. Finalization is blocked with the unmapped account list.
4. Map it again.

## Step 9 — Super-admin review

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
dropdb -h 127.0.0.1 -p 55432 -U postgres --if-exists quota_status_practice
createdb -h 127.0.0.1 -p 55432 -U postgres quota_status_practice
lsof -ti tcp:8788 | xargs -r kill
cd ~/Projects/BunProjects/quota-status-v2
nohup bun run start > /tmp/quota-v2-server.log 2>&1 &
```

Then open `/setup` again.

To view the previous demo instead:

1. Change `.env`:
   ```env
   DATABASE_URL=postgres://postgres@127.0.0.1:55432/quota_status
   ```
2. Restart the server.
3. Sign in with an account from that database. If you do not remember one, create a new super-admin with the CLI.

## Notes

- App login and OpenCode Console login are separate.
- The app never uses the read-only key for inference.
- The key is never returned to the browser.
- All groups are private; members can see all members and usage inside their group only.
- The current Go cycle is **15 Oct 2026 – 15 Nov 2026**.
- Do not finalize a real period before the cycle ends.
