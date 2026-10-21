# Local pre-deployment audit — 2026-10-21

Scope: local verification and deployment preparation only. Current source, client data, original uploads, backups and credentials are preserved. This is not a guarantee of production readiness or exhaustive coverage of every user workflow.

Follow-up: representative write workflows, reader restrictions, error recovery and phone/tablet layouts were subsequently verified using an isolated QA workspace. Two mobile issues were fixed. See [local workflow verification](LOCAL_WORKFLOW_VERIFICATION.md) for exact coverage and results; the earlier read-only browser limitation below describes this initial audit only.

## Results

- All six frontend format checks and production builds passed. Unit tests: Sales 44, Design 47, Accounts 26, Measurement 18, Management 37, login 11 (183 total).
- Backend: 30 tests passed against local PostgreSQL, including enabled real local Supabase private upload/download integration. One existing Starlette/httpx test-client deprecation warning remains.
- `scripts/check.py` passed syntax, business-rule, security/concurrency and Measurement persistence checks.
- All seven npm dependency audits completed successfully. Python audit initially found a certifi advisory; updated 2026.10.18 to 2026.10.19. Re-audit reports no known vulnerabilities. This is dependency-database evidence, not a full penetration test or OS-image vulnerability scan.
- Multi-stage Docker image built successfully, including all frontend assets. Rebuilt after the security patch. Root Compose starts the image successfully on loopback port 4302; health check passes.
- Runtime inspection confirmed user `crm`, read-only root filesystem, all capabilities dropped and absence of `.env`, `.local` and `env-path.txt` in `/app`.
- Existing admin login and client API work on both ports 4301 and 4302. All 28 client documents matched the pre-audit hash. Signature provider remains off; factory sender remains disabled.
- Actual container browser smoke checks passed for login, Sales, Design, Accounts, Measurement and Management. Measurement completed a live Zoho scan of 7,959 orders and displayed 95 open requests. No customer form was submitted. Mobile layout and every workflow permutation were not re-verified in this infrastructure-only audit.

## Changes

- Added canonical root Compose and a separate local-network override; private environment generator bridges the existing Supabase stack without new databases or copied customer data.
- Separated internal Storage transport from browser-facing signed URLs, with regression tests and production HTTP rejection.
- Native launcher/backend use the configured origin port; container health check uses its declared internal port.
- Added image health check and tightened Docker context exclusions. Updated container CI to PostgreSQL 17 and the canonical Compose file.
- Source release packaging now includes deployment/Supabase configuration and excludes CLI temporary metadata.
- Clarified current versus historical startup documentation. Kept department-oriented structure to avoid unnecessary file moves and broken imports.

## Structure and future work

`backend/` owns APIs, auth, repository, migrations, integrations and backend tests. Each department's `react/` owns native UI and its tests; `assets/` is required generated runtime output. `shared/` owns reused calculation/UI/upload contracts. `measurement/backend/` owns Zoho adaptation. `supabase/` owns local database/storage setup. `scripts/` owns launch, backup, verification and source packaging. `deploy/` owns container configuration/runbooks; `.github/workflows/` owns checks. Private `.local/`, `.env.local`, data and recovery copies stay outside release artifacts.

Add features inside their department; keep authorization and durable writes at server boundaries, pure calculations separately tested, schema changes versioned, and credentials server-only. See `docs/ARCHITECTURE.md` for dependency conventions.

## Remaining release gates

No hosted deployment, hosted TLS, cloud quotas, production credentials, production backup scheduler, restore drill against hosted infrastructure or live email/signature action was tested. Existing demo admin credentials must be replaced privately before exposure. Account recovery/MFA and multi-instance operational review remain necessary. Browser smoke checks are read-only; existing customer workflows were not submitted merely to test them. Existing backup/restore evidence is documented in `VERCEL_SUPABASE_VERIFICATION.md`; no live reset was performed.

Use `deploy/README.md` for exact local container commands, ports, backup and rollback. Approved cleanup is recorded in `CLEANUP_REVIEW.md`.
