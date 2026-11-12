# Security

OpenCode Quota is a private, invite-based billing dashboard for a small team. It
stores OpenCode Console read-only keys and billing data, so treat the deployment
host and its backups as sensitive.

## Reporting a vulnerability

Do not open a public issue. Use GitHub's private vulnerability reporting on this
repository (Security → Advisories → Report a vulnerability), or contact the
maintainer directly if you already have their address.

Include the affected version or commit, reproduction steps, and impact. This is a
solo-maintained project; expect a best-effort response rather than an SLA.

## Supported versions

Only the latest `main` and the latest `v*` release receive fixes. There are no
backported security branches.

## Threat model

Assets:

- OpenCode Console read-only keys, encrypted at rest.
- Session tokens and password hashes.
- Member emails, usage data, and billing amounts.

Trust boundaries:

- Browser → Cloudflared → app on `127.0.0.1`. The app must not be reachable
  directly from the LAN.
- App → PostgreSQL on `127.0.0.1`.
- App → Resend (email) and → OpenCode Console API (usage sync).
- Roles: member, group owner, super-admin. Every group is isolated.

Out of scope: a compromised office PC or OS administrator, a compromised
Cloudflare account, and a member who already holds valid credentials for their own
group.

## Implemented controls

### Authentication and sessions

- Passwords are hashed with Argon2id. Unknown emails still run a dummy verify to
  reduce timing differences.
- Session tokens are stored as `SHA-256(token + SESSION_SECRET)`, never in plain
  text. Session cookies are `HttpOnly`, `SameSite=Lax`, `Secure`, and use the
  `__Host-` prefix in production.
- State-changing requests require the per-session CSRF token.
- Password changes and resets revoke existing sessions. Email verification does
  not create a session.
- Login, signup, reset, resend, invite, sync, and setup are rate-limited in
  PostgreSQL, so limits survive restarts.
- Turnstile is required in production; the server refuses to start without both
  keys.

### Tenant isolation

Every billing, sync, and admin query is scoped by `group_id` plus the caller's
role. Cross-tenant access returns 404/403 and is covered by manual verification
rather than a dedicated automated test suite.

### Secrets at rest

- Console keys are encrypted with AES-256-GCM using `APP_ENCRYPTION_KEY`, with the
  group ID as additional authenticated data. A ciphertext moved to another group
  fails to decrypt.
- Keys are never returned to the browser.
- Logs mask email recipients and omit bodies, tokens, and full production error
  objects.

### Billing integrity

- Finalization is manual and owner-only.
- Finalization is blocked while the period is active, while usage is unmapped,
  while the IDR bill is empty, and until a successful sync happens **after** the
  period ends.
- Finalized bills and daily charts are immutable snapshots; later syncs do not
  change them.
- Reopen deletes the snapshot, returns the period to draft, and is recorded in the
  audit log.

### Headers and transport

- HSTS in production, CSP restricted to self plus Cloudflare Turnstile,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `noindex`, and `Cache-Control: no-store` for API responses.
- Request bodies are capped at 1 MB.

### Supply chain

- `bun.lock` is committed and CI installs with `--frozen-lockfile`.
- CI runs `bun audit` and fails the job when a known advisory is reported.

## Secrets inventory

| Secret | Where | Rotating it |
| --- | --- | --- |
| `SESSION_SECRET` | `.env` | Invalidates all sessions immediately. Safe to rotate; users sign in again. |
| `APP_ENCRYPTION_KEY` | `.env`, plus an offline copy | **Not** rotatable by itself. Changing it makes stored Console keys unreadable; re-enter every group's Console key after rotation. Back it up separately from the database. |
| `SETUP_TOKEN` | `.env` | Only used while no user exists. Rotation is harmless after setup closes. |
| `RESEND_API_KEY` | `.env` | Revoke in Resend, issue a new one, update `.env`, restart. |
| `TURNSTILE_*` | `.env` + Cloudflare | Roll the widget keys, update both sides, restart. |
| PostgreSQL password | `DATABASE_URL` | `ALTER ROLE`, update `.env`, restart the task. |
| Console key (per group) | Encrypted in PostgreSQL | Owner reconnects in Manage → Connection; old keys should be revoked in OpenCode Console. |

`SESSION_SECRET` and `APP_ENCRYPTION_KEY` must be 32-byte base64 values from
`openssl rand -base64 32`. Production refuses to start without `DATABASE_URL` and
an `https://` `APP_URL`.

## Operational monitoring

Check these regularly; they catch the failures that silently affect billing.

```sql
-- Last sync per group and its error, if any
select g.name, c.status, c.last_sync_at, c.last_error
from groups g left join console_connections c on c.group_id = g.id;

-- Recent sync runs
select group_id, status, started_at, finished_at, error
from sync_runs order by started_at desc limit 20;

-- Recent destructive or financial actions
select action, target, actor_user_id, created_at
from audit_logs where action in ('period.finalized', 'period.reopened') 
order by created_at desc limit 20;
```

Also watch:

- `GET /api/health` daily (returns 503 when the database is unreachable).
- Backup files in `C:\opencode-quota\backup`; a failed `pg_dump` throws instead of
  pruning old files.
- `needs_reauth` connection status, which means the Console key was revoked or
  expired.

## Incident response

1. **Contain.** Stop the scheduled task. If the public hostname may be exposed,
   disable the Cloudflared ingress first.
2. **Assess.** Read `audit_logs`, `sessions`, and `sync_runs`. Check whether
   `period.finalized` or `period.reopened` happened unexpectedly.
3. **Rotate.** Rotate `SESSION_SECRET` to kill all sessions, then the PostgreSQL
   password, Resend key, Turnstile keys, and any Console key that may be exposed
   (ask the owner to reconnect). Rotate `APP_ENCRYPTION_KEY` only if it leaked, and
   expect to re-enter every Console key.
4. **Recover.** Restore the last good `pg_dump` into a scratch database first,
   verify it, then restore in place.
5. **Notify.** Contact affected group owners directly. The app has no bulk
   notification tool.

## Known limitations

- Console key identity verification still relies partly on the token hint returned
  by the Console API. Full account-identity verification is tracked as residual
  item L4.
- `install-task.ps1` defaults to running as `SYSTEM` when `-ServiceUser` is not
  supplied. Use a dedicated low-privilege account in production.
- No two-factor authentication.
- Usage is attributed per service account, not per API key.
- Audit logs, meter snapshots, and finalized period data are kept indefinitely;
  there is no retention or purge job.
- The app logs to the console. Under Task Scheduler there is no console window, so
  rely on `last_error` in the UI and on PostgreSQL for diagnostics.
