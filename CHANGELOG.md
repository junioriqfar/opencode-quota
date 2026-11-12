# Changelog

## 2026-11-12

### Fixed

- Finalized periods no longer show stale quota values. Meter cards and per-member quota estimates stay live from the latest OpenCode Console snapshot, while the bill and daily chart remain frozen.
  - The monthly percentage now derives from the same latest snapshot as `used/limit` instead of the finalization snapshot.
  - Per-member `quotaPct` is recomputed from the live monthly percentage while billing amounts stay snapshotted.
- Periods are keyed by `start_date` when syncing, preventing duplicate periods if the Console start timestamp changes slightly.
- Browser favicon now uses the same gradient + Activity mark as the app header on every page.
- Finalization now requires a successful sync after the period end date, and finalized-before-end periods show a warning so they can be reopened. Finalization remains manual; the app never auto-finalizes a bill.

### Added

- `SECURITY.md`: reporting process, threat model, implemented controls, secrets inventory and rotation, monitoring queries, incident response, and known limitations.
- Period rollover runbook in `PRACTICE.md` and `scripts/rehearse-rollover.ts`, which rehearses finalization, the missing-sync block, bill freezing, reopen, and the period selector on a `*_rehearsal` database clone.
- Production readiness checklist in `README.md`, covering config, database, host, and the proxy trust boundary.
- `install-task.ps1` now accepts `-ServiceUser` (prompts for the password) and grants that account Modify on the app directory, so the task no longer has to run as SYSTEM.
- `test/config.test.ts` covers the production config guardrails.

### Changed

- `deploy/windows/backup.ps1` passes the database URI straight to `pg_dump`, so passwords containing `@` or `:` work when percent-encoded.
- `.env.example` and the docs use the real database name `opencode_quota` and default port 8788; production now refuses to start without an explicit `DATABASE_URL`.
- `APP_URL` must be `https://` in production, and startup warns when Resend is unconfigured or `HOST` is not loopback.

### Security

- Production hardening: `NODE_ENV` defaults to production, `DEV_EXPOSE_EMAIL_LINKS` is forced off in production, dev-only origins are removed, and Turnstile keys are required in production.
- Password policy now applies to signup, setup, reset, change-password, and CLI setup.
- Invite emails HTML-escape group names and sanitize subjects.
- Login `next` redirects are sanitized with `safeNextPath`.
- Finalization is blocked while a period is active; finalized period windows/prices are not mutated by sync.
- Login timing equalization for unknown emails; signup returns a generic response for existing addresses.
- Email verification no longer creates a session.
- Password change/reset invalidates outstanding reset/verify tokens.
- Production sessions use `__Host-qs_session`; HSTS and `Cache-Control: no-store` are enabled.
- Rate limits are stored in PostgreSQL and therefore survive restarts.
- Console key matches must resolve to one service account; ambiguous matches are rejected.
- Disabled groups are excluded from scheduled syncs.
- Pending invites are deduplicated and revoked when a member is removed or leaves.
- Logs mask recipients, omit email bodies/tokens, and redact production error objects.
- Windows backup checks `pg_dump` exit status before pruning and tightens backup ACLs.
- CLI setup accepts `--password-stdin` or `OPENCODE_QUOTA_PASSWORD`.

### Dependencies

- React Router 7.18.5
- Vite 8.3.8
- `@vitejs/plugin-react` 6.3.0
- Zod 4.6.7
- `bun audit`: no vulnerabilities found.

### CI

- Added `.github/workflows/ci.yml`: install, typecheck, tests, audit, Windows build, artifact upload, and release attachment for `v*` tags.

### Verification

- `bun test`: 19 pass.
- Backend and web typecheck pass.
- Frontend and Windows executables build successfully.
