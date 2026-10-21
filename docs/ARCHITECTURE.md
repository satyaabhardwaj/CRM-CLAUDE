# CRM architecture and feature boundaries

Current target: FastAPI + React on Vercel, Supabase PostgreSQL and private Storage. Today it runs locally only ([SETUP](SETUP.md)); hosting is described in [DEPLOYMENT](DEPLOYMENT.md).

## Current application

Sales, Design, Measurement, Accounts and Management are native React 19 + TypeScript 5 frontends. Each is built independently with Vite 8 and Node 24. Login and account security are also React, built from `backend/react`. FastAPI (port 4301) serves all of them plus the API.

| Location | Responsibility |
|---|---|
| department/index.html | Stable route entry, CSS and compiled module loading |
| department/react/src | Native screens, forms, typed selectors, state and API clients |
| department/react/tests | Synthetic model, persistence and component regression tests |
| department/assets | Generated frontend assets; ignored locally, included in releases |
| shared/runtime.js | Data cache, money/date formatting, notification records and PDF service; no UI renderer or save loop |
| shared/look.css | Shared design tokens and layout primitives |
| shared/rules.js, signals.js, people.js, pin.js | Shared financial/workflow rules, signals, staff data and PIN lookup |
| shared/kit.js | Old UI kit, kept only as the reference for the runtime parity test (`tests/runtime.test.cjs`) |
| backend/app.py, auth.py, mfa.py, recovery.py | FastAPI routes, sessions, realms, MFA, password recovery |
| backend/repository.py, models.py, storage.py | PostgreSQL data access, resource authorization, private Storage |
| backend/migrations | Versioned Alembic schema changes (0001–0006) |
| backend/react, backend/web | Login/session UI source and compiled public auth assets |
| core | Small shared library used by the backend: file-name safety (`server.safe_name`), public-file rules (`security.public_file`), store validation (`storage.validate`). The 4300 server that once used it is archived. |
| measurement/backend | Read-only Zoho pagination, normalization, timeout handling and cache |
| ai, sign, mail | Server-side provider integrations; not browser screens |
| supabase | Local service config and private bucket migration |
| scripts, tests, .github/workflows | Launcher, build, backup/restore, checks and CI |
| docs | Current docs; dated reports in docs/history |

There is no Pre-sales or Post-sales department. Design's Pre-design and Post-design flows are part of Design. The old `legacy.html` entries, the 4300 standalone server, the old snapshot publishers and the Windows helper source are on branch `archive/legacy-2026-10`. Some old dashboard JavaScript files remain in the department folders; no active entry loads them.

## Adding features

1. Add a typed component to the relevant `department/react/src`, and its business selector or command to that department's model or commands module.
2. Reuse the existing CSS tokens and semantic form labels.
3. Respect these boundaries:
   - A department must not import another department's screens.
   - Shared financial rules belong in `shared`.
   - External providers stay server-side.
   - Every database change gets a new Alembic revision.
4. Do not reintroduce Kit.h, Kit.app, DOM-rendering adapters, the legacy store.save/watch, or script injection into React screens. `scripts/check.py` runs the legacy-runtime guard.

The remaining JavaScript services are data, math and PDF integrations, not UI adapters:
- Measurement's source model maps the Zoho response.
- Accounts' master columns map fields.
- Sales `reports.js` renders PDFs.

Keeping them stable avoids changing financial contracts. Leaflet owns the map geometry; popup contents are React portals.

## Data and permissions

PostgreSQL keeps lossless client JSON documents with optimistic row versions, a workspace revision and metadata. This is not a fully normalized order/payment schema.

Server permissions are admin, reader and assigned-client grants ([SECURITY](SECURITY.md)). Full departmental dashboards need workspace access; assigned users use the resource-scoped API. Management and the Zoho Measurement feed are read-only.

The mutating React modules own their explicit saves, bounded stale-write retries and failure states. Same-client concurrent edits still need care; there is no field-level collaborative merge.

Factory email automation stays disabled; provider tests are mocked. No test may send live email, create real signatures, approve payments or write Zoho data.
