# FastAPI backend

Current setup: `Start CRM.cmd` runs the authenticated app on `CRM_ORIGIN` (default 4301), with local Supabase PostgreSQL (56322) and private Storage (56321). `.env.local` overrides the older `.local/backend-local.json` fallback. See `docs/VERCEL_SUPABASE.md` and `deploy/README.md`. The phase-1 instructions below describe the retained historical migration path; do not initialize or import another database for normal startup.

The existing `run.cmd` / port 4300 app remains unchanged. This backend runs separately on port 4301 and never reads or writes live JSON automatically. PostgreSQL is the runtime database; SQLite is only a portable test fallback. Python dependencies are pinned in `requirements-backend.txt`.

Login and sign-out are native React + TypeScript. Before starting from a clean checkout, run `npm ci --prefix backend/react` and `npm run build --prefix backend/react` (Node 24). Build the five department frontends as documented in the root README. `/auth-assets/` exposes only compiled JS/CSS; application APIs and department pages retain their existing access checks.

## Install / configure

```powershell
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-backend.txt
```

Export variables from `backend.env.example` in the launching shell. For local development only, `scripts/setup_backend_local.py` can initialize a new, isolated PostgreSQL 18 cluster under ignored `.local/postgres`, on loopback port 54329. It refuses to overwrite an existing cluster. `backend.local.load()` reads its ignored `.local/backend-local.json`; exported variables override these local defaults. Never use this local cluster or its owner account as a hosted production configuration.

To restart that existing local cluster on Windows, run PostgreSQL's `postgres.exe -D <workspace>/.local/postgres` in a separate terminal and keep it open. Then run `run-backend.cmd`. Do not start two PostgreSQL processes on the same cluster. `run.cmd` still starts the original app.

## Schema and import

For an exported database URL: `python -m alembic upgrade head`. For this machine's ignored local configuration:

```powershell
.\.venv\Scripts\python -c "from backend.local import load; load(); from alembic import command; from alembic.config import Config; command.upgrade(Config('alembic.ini'), 'head')"
.\.venv\Scripts\python -m backend.manage import data/store.json
.\.venv\Scripts\python -m backend.manage verify data/store.json
```

Import runs in one transaction and refuses an occupied database. Full snapshot equality is checked before commit. Client IDs, list order, metadata, financial values and unknown nested fields are preserved. `crm_clients` stores lossless JSON documents with optimistic row versions; `crm_state` preserves global metadata and revision. This is a compatibility schema, not the final normalized payment/order schema. PostgreSQL constraints cover primary keys, grants, valid roles and revisions. The migration is immutable and destructive downgrade is disabled.

Copy attachments into a separate private `CRM_UPLOADS_DIR`, compare names/counts/SHA256 hashes, and leave originals untouched. This machine has an isolated copy under `.local/migration-uploads`. Never run a stale importer over active data.

## Local admin login (replaces Supabase login)

Login now validates local email/password credentials in PostgreSQL. The previous Supabase provider flow is removed. Passwords are salted PBKDF2-HMAC-SHA256 hashes (600,000 iterations); plaintext is never stored in the database. Existing sessions are revoked and previous accounts disabled when replacing the administrator.

This local demo's credentials are in ignored `.local/admin-login.txt`. Do not publish this file. To replace the demo account with a private password, run `.venv\Scripts\python -m backend.reset_admin --email YOUR_EMAIL`; password entry is hidden and confirmed. Replacement affects CRM login only, never client records, Zoho keys or mail/signature integrations. This creates a login identifier, not an email inbox. Hosted deployment still needs account recovery, MFA and deployment security review.

## Permission contract

- admin: entire existing UI/store, uploads and external side effects.
- reader: entire existing UI/store and file reads, no writes or side effects.
- assigned: only granted clients through paginated `/api/clients` and `/api/clients/{id}`; optional full-client writes via explicit grant. No global store, legacy dashboard or global Zoho endpoint access.

Assigned-user dashboard and department-specific field/action policies are a later phase. Do not grant full-client write access where payment/approval fields must be restricted. Staff dropdowns never confer server permissions. Legacy UI full-store writes are admin-only; they retain revision/conflict behavior and soft deletion. Scoped updates use per-client versions and increment the global revision in the same transaction. A global lock order prevents legacy/scoped write races. The old UI's automatic same-client merge remains a cutover risk; dedicated conflict UX is still required before broad concurrent editing.

Local login creates a random HttpOnly SameSite=Strict CRM session, stored only as a hash in PostgreSQL, valid at most one hour. HTTPS deployments use Secure cookies. Logout deletes the session; disabled local memberships take effect immediately. No automatic refresh implemented. Passwords/provider tokens are not stored. Same-origin write checks and host validation are enforced. Validation errors do not echo passwords. Login throttling is in-process; distributed rate limiting is a hosted-release gate.

Tables enable PostgreSQL RLS and revoke PUBLIC/anon/authenticated access. Browser database access is denied; FastAPI is the data boundary. A private owner/server database connection is required for this initial schema. Do not expose its credentials. Production needs a dedicated least-privilege server role and reviewed policies; RLS is not being claimed as per-user enforcement for the privileged backend connection.

## Compatibility and verification

API contracts retained: store GET/PUT, uploads/downloads, Measurement, AI status/transcription, mail and signature routes. Existing pages/assets are served unchanged except an injected session-expiry redirect and Sign out button. Provider calls remain server-side; no real emails/signatures are sent by tests. Upload storage is still private local disk; Supabase Storage migration is later work.

Run `python -m pytest backend/tests -q`. With TEST_DATABASE_URL set to a dedicated PostgreSQL test database, each fixture creates a unique schema (kept for inspection). Never point this at production. Tests cover exact import, duplicate-import refusal, anonymous denial, roles/client grants, concurrency, stale writes, expiry/logout/revocation, CSRF, private-file blocking and attachment access. CI includes PostgreSQL 18. Also run existing `python -B scripts/check.py`.

## Current verification / release gate

Local PostgreSQL migration 0001 applied; all 28 clients reconciled exactly and 15 attachments matched hashes. No live JSON writes or cloud changes. Hosted database, cross-worker load, external sends and hosted security are not verified. Existing 4300 remains the active CRM; 4301 is a migration preview using the local admin login.

Before cutover: configure staging Auth, provision memberships, validate full workflows/financial outputs and uploads with real authorized test users, review department/field permissions, set backups/TLS/secret management and shared rate limits, take a write freeze, re-import into a fresh database, reconcile, then switch traffic. Do not dual-write JSON and PostgreSQL. If post-cutover writes exist, export/reconcile them before rolling back; never simply revert to an old JSON copy.

Verification on 19 October 2026: nine API/security/concurrency/provider-contract tests passed against isolated PostgreSQL schemas. TestClient emitted one upstream httpx deprecation warning; no failures. Login form and missing-provider error checked in the browser; real provider login remains blocked by missing configuration.
