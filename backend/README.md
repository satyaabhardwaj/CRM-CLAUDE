# FastAPI backend

`Start CRM.cmd` starts local Supabase and the authenticated CRM at http://127.0.0.1:4301. Configuration comes from `.env.local`, with exported variables taking precedence. Hosted entrypoints do not load local settings.

See [SETUP](../docs/SETUP.md), [SECURITY](../docs/SECURITY.md), [ARCHITECTURE](../docs/ARCHITECTURE.md) and [DEPLOYMENT](../docs/DEPLOYMENT.md) for current instructions. Use `backend.env.example` as the hosted variable inventory; keep actual credentials private.

FastAPI serves six React frontends and the API. PostgreSQL stores lossless client JSON with optimistic versions and workspace revisions; private Supabase Storage holds attachments. Department permissions, MFA, realm isolation, CSRF and shared login throttling are enforced by the backend. Business rules live in CLAUDE.md.

Build all frontends with `npm run build`. Run `python -m pytest backend/tests -q` using `TEST_DATABASE_URL` for a disposable local `crm_crud_test_*` database. Tests must never target the live database or bucket. Run `python -B scripts/check.py` for dependency-free syntax and contract checks.

Migrations run separately from startup and builds. Provision fresh identities for each hosted environment. Never use `backend.reset_admin` for hosted provisioning or import development authentication data.
