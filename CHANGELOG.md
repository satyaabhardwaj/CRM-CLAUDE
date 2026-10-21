# Changelog

All notable changes to the Magppie CRM. Dates are 2026.

## v1.0-rc3 (22 Oct)

### Phase 6: regression (22 Oct)
- Full regression passed: frontends 212 tests; backend 124 (including real Storage); CRUD/roles 28; container smoke 121/121; 40 viewport views; secret scan clean. Details are in FINAL_DEPLOYMENT_CHECKLIST.

### Phase 2: cleanup (21 Oct, Gate A)
- Archived retired code on branch `archive/legacy-2026-10` and removed it from `main`:
  - `online/`, `vercel/`, `windows-helper/`, `deploy/staging/`;
  - the 4300 launchers `run.cmd`, `run.sh`, `measurement/server.py` and `measurement/start.cmd`;
  - `test/`, `pre-sales/`, `post-sales/`, the tracked `backup/` code snapshots and the five `legacy.html` entries.
  `core/` and `shared/kit.js` stay, because they are still imported or tested.
- Moved 18 older backups, the old `data/` folder, the pre-Supabase cluster and the migration uploads into one AES-256 archive outside OneDrive. All 3,923 files were verified before the originals were removed.
- Dropped the QA databases, 85 synthetic `test_*` schemas found inside the live database, and the QA bucket. Live data was unchanged.
- Removed the merged remote branch `satya_end_changes`.

### Phase 3: restore (21 Oct)
- Added `scripts/restore_postgres.py`, a one-command restore into a new, empty database only, optionally with a new private bucket. It refuses the live database or bucket, non-empty targets and tampered backups.
- Fixed the duplicate `public` schema restore failure by restoring through a filtered `pg_restore` list.
- Restores now re-apply RLS and revoke PUBLIC/anon/authenticated access.
- `backup_postgres.py --restore-check` now uses the same path.
- `backend/tests/test_api.py` now refuses any database that is not a local `crm_crud_test_*` one.
- Rehearsed: 15 tables, 28 clients and 15 attachments matched.

### Phase 4: docs (22 Oct)
- Consolidated the docs into ARCHITECTURE, SETUP, DEPLOYMENT, OPERATIONS and SECURITY, plus this changelog.
- Moved older reports to `docs/history/`.
- Start instructions now point to `Start CRM.cmd` / 4301, and port 4300 is marked retired. The business rules in CLAUDE.md are unchanged.

### Phase 5: product finishing (22 Oct)
- MFA policy: admins must use an authenticator; reader and assigned stay optional.
  - It is enforced on the server: an unenrolled admin gets a 403 `mfa_enrollment_required` response from every data API, and pages redirect to `/security`.
  - Admins cannot disable MFA.
  - Hosted environments fail closed without the MFA key.
- Account security page explains the requirement, and the session script sends a blocked admin to `/security`.
- New operator command `backend.reset_mfa` for identity-verified lost-factor recovery (owner Satya Bhardwaj), documented in SECURITY.
- No logo change and no business-rule change (as decided).

## v1.0-rc2 (21 Oct, 7469f56)
- Hosted identity isolation: environment realm UUID, account and session bindings (Alembic 0004).
- Password recovery by email, off by default (0005).
- Authenticator MFA with recovery codes, opt-in (0006). Logout also revokes pending MFA challenges.
- Account security page and account menu; Quiet Graphite sign-in, recovery and MFA screens.
- Reader permissions enforced in every module; archived architects preserved.
- CI aligned to an isolated `crm_crud_test_ci` database, with consistent line endings.
- Deployment-readiness docs, and a local restore rehearsal: 15 tables and 15 attachment hashes matched.

## v1.0-rc1 (21 Oct, 78d14b1)
- FastAPI backend with local admin login, PostgreSQL (Alembic 0001–0003) and local Supabase PostgreSQL + private Storage. All 28 clients and 15 attachments were reconciled at cutover.
- Sales, Design, Accounts, Measurement and Management migrated to React 19 + TypeScript, plus a React login.
- Unified responsive layouts, navigation and user menus.
- One-click `Start CRM.cmd`, a multi-stage Docker image, CI on Ubuntu and Windows, and future Vercel configuration with Git auto-deploy disabled.
- Regression suites and isolated CRUD verification. Factory email disabled (403), signatures off, Zoho read-only.
