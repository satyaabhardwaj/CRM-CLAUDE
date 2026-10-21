Current target: **Vercel + Supabase**, local development only until explicitly authorized. Double-click **Start CRM.cmd** to start Docker, local Supabase and CRM and open the browser. See [local setup and architecture](docs/VERCEL_SUPABASE.md). Use `npm run build` for all six frontends; the CRM runs on port 4301.

# MAGPPIE CRM

Department-oriented CRM: Measurement, Accounts, Sales, Design and Management (Tavneet) use React + TypeScript. Sales and Design workflow forms and dashboards are native React; the existing shared calculation and PDF services are retained. Management reports and drill-downs are native React and remain read-only. Both the local Python server and the authenticated FastAPI backend serve the compiled assets. Node 24 builds these frontends. Existing client data and external credentials stay outside Git.

Before first run or after Measurement source changes: `npm ci --prefix measurement/react` then `npm run build --prefix measurement/react`. See [Measurement migration and rollback](docs/MEASUREMENT_REACT.md).

For Accounts: `npm ci --prefix accounts/react` then `npm run build --prefix accounts/react`. Run `npm test --prefix accounts/react` and `npm run format:check --prefix accounts/react`. See [Accounts migration, verification and rollback](docs/ACCOUNTS_REACT.md).

For Sales: `npm ci --prefix sales/react` then `npm run build --prefix sales/react`. Run `npm test --prefix sales/react` and `npm run format:check --prefix sales/react`. See [Sales migration boundaries, verification and rollback](docs/SALES_REACT.md).

For Design: `npm ci --prefix design/react` then `npm run build --prefix design/react`. Run `npm test --prefix design/react` and `npm run format:check --prefix design/react`. See [Design migration, verification and rollback](docs/DESIGN_REACT.md).

For Management: `npm ci --prefix management/react` then `npm run build --prefix management/react`. Run `npm test --prefix management/react` and `npm run format:check --prefix management/react`. See [Management reports, verification and rollback](docs/MANAGEMENT_REACT.md).

For login/session UI: `npm ci --prefix backend/react` then `npm run build --prefix backend/react`. See [whole-CRM migration audit](docs/MIGRATION_AUDIT.md) for all verification results, remaining service dependencies and rollback.

## Historical standalone server (not the current deployment path)

Windows: `run.cmd`. macOS/Linux: `bash run.sh`. Both run `python -B measurement/server.py` and include live Measurement. Open http://127.0.0.1:4300/measurement/ or /sales/.

Export configuration in the launching shell; `.env.example` is documentation, not an automatically loaded file. A fresh checkout opens with an empty client list. Never copy production data into fixtures. For Zoho, set `MEASUREMENT_ENV_FILE` to a private external file; see [Measurement](measurement/README.md).

Optional local authentication: set `CRM_ADMIN_PASSWORD` and optionally `CRM_READER_PASSWORD` in the process environment before launch. Browser sign-in uses username `admin` or `reader`. Both can read the entire workspace; only admin can mutate. Without these variables the app is explicitly a single-user local application. Never expose this HTTP server publicly.

Checks: `python -B scripts/check.py` (Python/JS syntax, API/security/concurrency and Measurement tests). Build: `python -B scripts/build.py` creates a deterministic source ZIP without client data or credentials. This is a source release, not a hosted production build. Browser fixtures: `/measurement/tests/ui.html` and `/test/rules-tests.html`.

## Structure and operations

- [Architecture and future feature rules](docs/ARCHITECTURE.md)
- [Configuration, release, backups and recovery](docs/OPERATIONS.md)
- [Verification and remaining work](docs/VERIFICATION.md)

Existing department URLs, JavaScript globals and store API remain compatible. Uncommitted Measurement work is retained. No customer data has been migrated, reset or overwritten by this foundation work.

## Current backend

FastAPI serves all departments and login on port 4301, using local Supabase PostgreSQL and private Storage. Use `Start CRM.cmd`. Port 4300 is the retained historical standalone server, not the current application. See [container runbook](deploy/README.md), [pre-deployment audit](docs/PREDEPLOYMENT_AUDIT.md), and [backend permissions](backend/README.md).
