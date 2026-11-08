# Review Guide — Quota Status v2

## URLs

| App | URL |
|---|---|
| v2 multi-tenant (new) | <http://127.0.0.1:8788> |
| v1 single-workspace (old) | <http://127.0.0.1:8787> |

Current state: the app uses the practice database. It may already contain your accounts and groups. Sign in with your super-admin account; if `/setup` is still required, create it with the setup token from `.env`. See `PRACTICE.md`.

Never commit `.env` or real account credentials.

## What to review

### 1. Auth

- `/login` — sign in.
- `/signup` — open signup, email verification. In dev, the verification link is shown on screen / logged.
- `/forgot` and `/reset` — reset password. Dev reset link is shown.
- `/setup` — only available while no super-admin exists. Production uses `SETUP_TOKEN`.

### 2. Groups

- `/app` — groups you own/joined.
- Group card shows owner, member count, Console status, period, monthly percent, last sync.
- “Create group” is limited by the super-admin setting.
- After creating a group, the app automatically opens **Manage → Connection** with a “Next step: connect your OpenCode read-only key” banner.
- Clicking a group that has no Console key opens **Manage → Connection** directly, so the key step is always visible. The group switcher follows the same rule.
- Owners can rename or delete a group in **Manage → Settings**. Deletion requires typing the exact group name.

### 3. Group dashboard

Open **Example Team**.

Review:

- Meter cards: monthly, weekly, 5-hour.
- Usage share donut.
- Daily usage stacked chart.
- Members table: all members can see each other and usage. Click **Models** on a member to open a modal with per-model requests, tokens, list cost, and share.
- Reconciliation: official Go meter vs export list cost.
- Billing card: total IDR is not set yet (intentional).
- Owner sees “Before finalizing” blockers and “Manage”.

### 4. Owner admin

Click **Manage**.

Tabs:

- **Connection** — Console read-only key is connected and masked. Try “Sync now”.
- **Members** — members, invite by email or link, pending invites, remove member, model usage modal per member.
- **Mapping** — map service accounts to members. The reader account is excluded.
- **Billing** — set total IDR, finalize, reopen, see blockers.
- **Audit** — key/invite/mapping/billing actions.
- **Settings** — rename the group or delete it permanently (owner only). Deletion uses a shadCN alert dialog and requires typing the group name.

Current state:

- One imported service account is mapped to the owner.
- One imported service account is unmapped.
- Period is **draft**
- Total IDR is empty

### 5. Finalization block

To see the real blocker:

1. Open **Mapping**.
2. Remove the mapped service account (trash icon).
3. Go to **Billing**.
4. Finalization is blocked with the unmapped account list.
5. Map the account again.
6. Enter a total IDR (for example `170000`) and finalize.
7. Reopen if you want to keep testing.

After finalization:

- Member amounts are locked.
- Daily chart uses the signed snapshot.
- New sync does not change the finalized period.

### 6. Member view

Log out, then sign in with the member account you invited.

- Can see the group dashboard and every member.
- Cannot open `/admin`, connection, members management, mapping, billing, or audit.
- Cross-group access is blocked.

### 7. Super-admin

Sign back in as the owner / super-admin account you created.

- Click **Super-admin** in the header.
- Review tenants, disable/enable, sync health, open signup, max groups per user.

## Current dev state

- Database: `quota_status_practice`
- Accounts and groups may already exist from your practice run
- If setup is complete, use `/login`
- Resend/Turnstile: dev mode (no keys)
- PostgreSQL dev: `127.0.0.1:55432`
- The previous demo database `quota_status` is preserved in `backups/`.
- Data is temporary (`/tmp`); production uses the office PostgreSQL.
- Follow `PRACTICE.md` for the from-scratch flow.

## Screenshots

Screenshots are kept in `docs/screenshots/` locally, but that folder is **git-ignored** because the images may contain real names, emails, usage, and billing data. Regenerate them with demo data if you want to publish screenshots.

Screenshots show the previous demo database. The live app uses the practice database; your own accounts and groups may already exist there.

UI primitives use shadCN UI. Native `<select>`, `<button>`, and `<label>` have been replaced with shadCN Select, Button, and Label. Charts are custom CSS inside shadCN Cards.
