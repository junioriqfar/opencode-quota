# OpenCode Quota — Multi-tenant Quota & Bill Splitting

Rencana kerja dan catatan implementasi.

## 1. Tujuan

Aplikasi **privat multi-tenant** untuk banyak pemilik workspace OpenCode:

- Pemilik workspace membuat **Grup**, menghubungkan **Workspace OpenCode** dengan key read-only.
- Pemilik mengundang anggota ke grup.
- Anggota bisa melihat seluruh anggota dan pemakaian dalam grup yang sama.
- Pemilik memetakan **service account** ke anggota.
- Pemilik mengisi total tagihan IDR dan **finalisasi** periode.
- Tidak ada halaman publik. Semua data hanya untuk anggota grup.
- Super-admin mengelola aplikasi (approval/batas grup, kesehatan sync), tetapi tidak bisa melihat key mentah.

## 2. Keputusan yang sudah dikunci

| Topik | Keputusan |
|---|---|
| Stack | **Bun + Hono + PostgreSQL + React/Vite/Tailwind/shadCN** |
| Language | **English** untuk UI, email, dan pesan API |
| Database | **PostgreSQL** (PC kantor sudah punya) |
| Auth | **Email + password** |
| Signup | **Open signup** + verifikasi email + guardrail (Turnstile/rate limit) |
| Email | **Resend**; dev mode menampilkan link verifikasi di log/UI |
| Turnstile | Opsional di dev; **wajib di production** |
| Multi-tenant | User global, role **per grup** (owner/member) |
| Grup per user | Dibatasi; super-admin bisa mengatur (default 3) |
| Invite | **Owner** grup saja |
| Mapping | **Per service account** (bukan per API key) |
| Key read-only | Disimpan **terenkripsi per grup**, diverifikasi dulu, harus read-only |
| Finalisasi | **Owner**; diblokir jika ada service account berusage yang belum dipetakan |
| Visibilitas | Semua anggota grup melihat semua anggota + pemakaian grup |
| Publik | **Tidak ada** halaman publik |
| Notifikasi | In-app saja |
| Backup | Lokal |
| Super-admin | Dibuat lewat `/setup` dengan `SETUP_TOKEN`; email diisi saat setup |
| Seed | Grup **“Example Team”**; Anggota kedua diundang sebagai user (pending invite link) |

## 3. Arsitektur

```text
Browser (React + shadCN, private)
        │  session cookie + CSRF
        ▼
Bun + Hono (port 8788 dev / 8787 prod)
        │
        ├── PostgreSQL (local di PC kantor)
        │     users, groups, memberships, invites,
        │     console_connections (key terenkripsi),
        │     service_accounts, mappings, periods,
        │     usage_daily, snapshots, audit, settings
        │
        └── OpenCode Console API (read-only key per grup)
              /go/status
              /service-accounts
              /config
              /v2/usage/export
```

## 4. Auth & keamanan

- Password: **Argon2id** (`Bun.password`).
- Session: token acak 32 byte, hash SHA-256 di DB, cookie HttpOnly/Secure/SameSite.
- CSRF: token per session, header `X-CSRF-Token` untuk mutasi.
- Verifikasi email: token sekali pakai, expired 24 jam.
- Reset password: token sekali pakai, expired 1 jam; revoke semua session setelah reset.
- Rate limit login/signup/reset/validasi key.
- Turnstile diverifikasi server-side jika secret diisi.
- Origin check untuk request mutasi.
- Semua query tenant wajib `group_id`.
- Uji isolasi: user Grup A tidak bisa membaca/mengubah data Grup B.
- Super-admin tidak bisa melihat key mentah; hanya status/rotate/delete lewat owner.

## 5. Enkripsi key Console

- Master key: `APP_ENCRYPTION_KEY` (32 byte base64) di `.env`, bukan di DB.
- AES-256-GCM per grup, nonce unik, AAD = `group_id`.
- Simpan ciphertext, iv, tag, fingerprint SHA-256, hint.
- Key tidak pernah dikembalikan ke browser.
- Validasi sebelum simpan:
  - `/go/status` OK.
  - `/service-accounts` OK.
  - Key harus ditemukan sebagai **service account key** (bukan personal key).
  - Permission harus **read** (bukan all).
  - Org/workspace ID dideteksi; duplikat workspace antar grup ditolak.
- Rotasi/delete: owner-only + audit.

## 6. Atribusi & finalisasi

- Sumber usage: export harian Console per **service account**.
- Mapping: service account → anggota grup (unik per grup).
- Anggota boleh punya beberapa service account.
- Akun reader (key read-only aplikasi) otomatis dikecualikan.
- Akun berusage yang belum dipetakan:
  - tetap masuk total list cost,
  - ditampilkan sebagai “Belum dipetakan” ke owner,
  - **memblokir finalisasi**.
- Finalisasi:
  - owner-only,
  - wajib total IDR sudah diisi,
  - wajib tidak ada usage unmapped,
  - menyimpan snapshot: total list cost, share, amount USD/IDR, requests/tokens, mapping.
  - Setelah final, perubahan mapping/usage tidak mengubah tagihan periode itu.
- Reopen: owner-only, audit, menghapus snapshot lama dan kembali draft.
- Perhitungan IDR: largest remainder agar total pas.
- Meter resmi Go ditampilkan terpisah dari list cost.

## 7. Skema database (konsep)

- `users`, `sessions`, `email_tokens`
- `groups`, `group_members`, `invites`
- `console_connections` (1:1 grup, key terenkripsi, org ID unik)
- `service_accounts` (per grup)
- `account_mappings` (service account → user)
- `periods` (per grup, draft/finalized)
- `usage_daily` (per grup/service account/model)
- `meter_snapshots` (per grup/periode)
- `period_snapshots` (per periode/member)
- `audit_logs`, `sync_runs`
- `app_settings` (max groups per user, signup open, dll)

## 8. API utama

Auth:
- `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`
- `GET /auth/verify`, `POST /auth/forgot`, `POST /auth/reset`
- `GET /auth/me`
- `GET /setup/status`, `POST /setup`

Grup:
- `GET /api/groups`, `POST /api/groups`
- `GET /api/groups/:id`, `/summary`, `/history`, `/periods`
- `GET/POST/DELETE /api/groups/:id/invites`
- `POST /api/invites/:token`
- `GET /api/groups/:id/members`, `DELETE /api/groups/:id/members/:userId`
- `GET/PUT/DELETE /api/groups/:id/console`
- `POST /api/groups/:id/sync`
- `GET /api/groups/:id/service-accounts`
- `PUT/DELETE /api/groups/:id/mappings/:serviceAccountId`
- `PUT /api/groups/:id/periods/:periodId/bill`
- `POST /api/groups/:id/periods/:periodId/finalize`
- `POST /api/groups/:id/periods/:periodId/reopen`
- `GET /api/groups/:id/audit`

Super-admin:
- `GET /api/admin/groups`
- `GET/PUT /api/admin/settings`
- `POST /api/admin/groups/:id/disable|enable`

## 9. UI

- Auth: login, signup, verifikasi, lupa/reset password, setup super-admin.
- App: daftar grup, ganti grup, dashboard grup.
- Dashboard: meter, share chart, daily chart, tabel anggota, rekonsiliasi, tagihan.
- Admin grup: koneksi Console, sync, anggota/invite, mapping, tagihan/finalisasi, audit.
- Super-admin: daftar grup, batas grup per user, signup open/closed, kesehatan sync.
- Dark mode toggle, responsive.
- Tidak ada halaman publik.

## 10. Migrasi dari v1

- Baca SQLite v1 (`../quota-status/data/quota.db`).
- Buat grup **Example Team** milik owner.
- Import periode, service account, usage harian, meter snapshot.
- Map service account `API` ke owner.
- Buat pending invite link untuk anggota kedua.
- Biarkan service account anggota kedua unmapped → finalisasi diblokir sampai anggota tersebut join dan dipetakan.
- Import dilakukan setelah owner dibuat (setup/seed).

## 11. Checklist

- [x] PLAN.md
- [x] Setup PostgreSQL dev + `.env`
- [x] Scaffold Bun/Hono/React/shadCN
- [x] Schema + migration runner
- [x] Auth email/password + session + CSRF + verifikasi/reset
- [x] Resend/dev email + Turnstile opsional
- [x] Group/membership/invite/role
- [x] Console validation + enkripsi key + duplicate workspace
- [x] Sync per grup + period + usage + meter
- [x] Mapping service account → member
- [x] Billing + blokir finalisasi + snapshot + reopen
- [x] Audit log + super-admin settings
- [x] UI auth + grup + dashboard + admin
- [x] Migrasi v1 (Grup Example Team + invite anggota)
- [x] Tests (auth, isolasi tenant, billing, finalisasi)
- [x] Build Windows + README
- [x] Verifikasi browser

## 12. Catatan dev

- Dev server v2 di `http://127.0.0.1:8788` (v1 tetap di 8787).
- PostgreSQL dev lokal di port `5432`.
- Resend/Turnstile kosong → dev mode: link verifikasi muncul di log/response. Di production, link dev dipaksa nonaktif.
- Super-admin dev dibuat lewat CLI `setup` atau `/setup`.
- Key Console v1 dapat dipakai untuk migrasi.


## 13. Hasil implementasi

- Lokasi: `~/Projects/BunProjects/opencode-quota` (v1 tetap di `quota-status`).
- Stack: Bun + Hono + PostgreSQL + React/Vite/Tailwind/shadCN.
- PostgreSQL dev: port `5432`, database `opencode_quota`.
- Auth: email/password, Argon2id, session cookie, CSRF, verifikasi email, reset password.
- Resend/Turnstile: dev mode (link email di log/UI); production wajib mengisi key, dan dev email links otomatis nonaktif saat `NODE_ENV=production`.
- Multi-tenant: user global, group, membership role per group, invite owner-only, group limit dari super-admin.
- Console key: validasi read-only service account, AES-256-GCM per group, fingerprint, deteksi workspace duplikat.
- Sync: per group, reader account otomatis dikecualikan, meter snapshot, usage harian.
- Mapping: per service account; akun unmapped memblokir finalisasi.
- Billing: total IDR manual, largest remainder, snapshot member + daily snapshot, reopen.
- UI: login/signup/verify/forgot/reset/setup, group list, dashboard, admin tabs (connection/members/mapping/billing/audit), super-admin panel.
- Migrasi v1: grup **Example Team**, service account API dipetakan ke owner, anggota kedua diundang dan dipetakan (dev), usage/periode/meter diimpor.
- Dev group saat ini draft dengan total tagihan kosong; finalisasi sudah diuji lalu di-reopen agar siap diisi tagihan asli.
- Verifikasi: login, invite accept, mapping, finalization block, finalization, reopen, cross-tenant 403, member cannot access owner/admin endpoints.
- Tests: 19 pass (money, CSV parser, crypto key encryption, redirect, sync schedule).
- Windows build: `dist/quota.exe` (server) + `dist/quota-cli.exe` (admin), PE32+ x86-64.
- Browser verification: login, account menu/change password, group list, dashboard, admin connection/members/mapping/billing/audit, super-admin, Turnstile flows.
- Security hardening: password policy di setup/reset/CLI, escape HTML email undangan, sanitasi redirect login, dev email links dipaksa off di production.
- Hardening lanjutan: production wajib Turnstile, origin dev hanya di development, finalisasi hanya setelah periode berakhir, finalized period tidak dimutasi sync, dummy Argon2 untuk login email tak dikenal, rate limit per-IP sebelum parsing body, batas body 1 MB, periode dikunci berdasarkan start_date.
- Hardening L1-L3/M7: token reset/verify dicabut saat ganti/reset password, verifikasi email tidak auto-login, cookie `__Host-`, HSTS, `Cache-Control: no-store` untuk API, React Router/Vite/Zod diperbarui, `bun audit` bersih.
- Status audit: C1, H1, M1-M7, L1-L11 selesai. Termasuk: key ambiguity rejection, log redaction, backup verification/ACL, disabled-group sync filter, CLI password via stdin/env, invite revocation/dedupe.
- UI: account menu, change password, password strength, Turnstile login/reset, responsive layout, scheduled sync.
- README + deploy Windows + Cloudflared + backup script tersedia.


## 14. Practice reset

- Super-admin aplikasi: akun yang kamu buat sendiri.
- Akun OpenCode Go Console: akun Console milikmu sendiri.
- Database practice: `opencode_quota` (akun/grup bisa sudah ada).
- Database demo lama: `quota_status`, backup di `backups/`.
- Panduan langkah demi langkah: `PRACTICE.md`.
