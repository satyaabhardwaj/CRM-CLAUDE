# MAGPPIE CRM

A department-oriented CRM with five modules: Sales, Design, Measurement, Accounts and Management. Each module is a React + TypeScript app, served with login by a FastAPI backend on local Supabase (PostgreSQL + private Storage). Hosting target: Vercel + Supabase. It is local only until deployment is explicitly approved.

## Start

Double-click **Start CRM.cmd**. It starts Docker, local Supabase and the CRM, then opens http://127.0.0.1:4301/.

The old 4300 standalone server (`run.cmd`, `run.sh`, `measurement/server.py`) is **retired**; its code is on branch `archive/legacy-2026-10`.

## Build and check

```powershell
npm run build
.venv\Scripts\python.exe -B scripts\check.py
.venv\Scripts\python.exe -m pytest backend\tests -q
```

`npm run build` builds all six frontends (Node 24). The backend tests need `TEST_DATABASE_URL` pointing at a local `crm_crud_test_*` database for the PostgreSQL suite.

Per-module test and format commands are in [SETUP](docs/SETUP.md#frontends).

## Documentation

| Doc | What it covers |
|---|---|
| [ARCHITECTURE](docs/ARCHITECTURE.md) | Folders, boundaries, how to add features |
| [SETUP](docs/SETUP.md) | Local machine setup, ports, checks |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Vercel + Supabase plan (not yet authorized) |
| [OPERATIONS](docs/OPERATIONS.md) | Backup, one-command restore, rotation, incidents |
| [SECURITY](docs/SECURITY.md) | Roles, sessions, realms, MFA, recovery |
| [PRODUCTION_SECRETS](docs/PRODUCTION_SECRETS.md) | Every secret and setting, by name |
| [FINAL_DEPLOYMENT_CHECKLIST](docs/FINAL_DEPLOYMENT_CHECKLIST.md) | Current readiness |
| [CHANGELOG](CHANGELOG.md) | Releases |
| [docs/history](docs/history/README.md) | Dated reports and module migration notes |

Business rules and folder conventions for editors are in [CLAUDE.md](CLAUDE.md).

## Data and secrets

Client data, attachments and credentials never go into Git. They are kept in local Supabase and in the ignored files `.env.local` and `.local/`. Never copy production data into fixtures. Factory email is disabled (403), signatures are off and there are no Zoho writes.
