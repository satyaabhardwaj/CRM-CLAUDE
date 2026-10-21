Hosting/data foundation: [Vercel + local Supabase](VERCEL_SUPABASE.md) is the current architecture. Earlier container staging notes are historical preparation, not a deployment instruction.

# CRM architecture and feature boundaries

## Current application

Sales, Design, Measurement, Accounts and Management are native React 19 + TypeScript 5 frontends, built independently with Vite 8 / Node 24. Their existing URLs and shared visual tokens remain stable. Login and the sign-out control are also React, built from backend/react. See [migration audit](MIGRATION_AUDIT.md) for the active dependency inventory and verification.

| Location | Responsibility |
|---|---|
| department/index.html | Stable route entry, CSS and compiled module loading |
| department/react/src | Native screens, forms, typed selectors, state and API clients |
| department/react/tests | Synthetic model, persistence and component regression tests |
| department/assets | Generated frontend assets; ignored locally, included in releases |
| shared/runtime.js | Data cache, money/date formatting, notification records and PDF service; no UI renderer or save loop |
| shared/look.css | Existing shared design tokens and layout primitives |
| shared/rules.js, signals.js, people.js, pin.js | Shared financial/workflow rules, signals, staff data and PIN lookup services |
| backend/react, backend/web | Native login/session source, login shell and compiled public auth assets |
| backend/app.py, auth.py, repository.py, models.py | FastAPI routes, local admin sessions, authorization, PostgreSQL data access and schema |
| backend/migrations | Versioned Alembic schema changes |
| measurement/backend | Read-only Zoho pagination, normalization, timeout handling and cache |
| ai, sign, mail | Server-side provider integrations; not separate browser screens |
| core | Separate local single-user JSON server on 4300 |
| scripts, tests, .github/workflows | Validation, packaging, backups, fixtures and CI |
| docs | Architecture, module migration notes, operations and verification |

There is no implemented Pre-sales or Post-sales department UI to migrate. Design's Pre-design/Post-design flows are part of Design. Existing legacy.html entries and old dashboard files remain rollback references, not active navigation targets. shared/kit.js is now rollback/test-only. Do not delete unrelated historical work.

## Adding features

Add a typed component to the relevant department/react/src and its business selector/command to that department's model or commands module. Reuse existing CSS tokens and semantic form labels. A department must not import another department's screens. Shared financial rules belong in shared; external providers stay server-side. Do not reintroduce Kit.h, Kit.app, DOM-rendering adapters, legacy store.save/watch, or script injection into React screens. The legacy-runtime guard is run by scripts/check.py.

The remaining JavaScript services are data/math/PDF integrations, not UI adapters. Measurement's source-model maps the existing Zoho response; Accounts' master-columns maps fields; Sales reports.js renders PDFs. Keeping these stable avoids changing existing financial contracts. Third-party Leaflet owns map geometry; popup contents are React portals with cleanup.

## Data and permissions

Port 4301 uses FastAPI, PostgreSQL and local administrator authentication. PostgreSQL retains lossless client JSON documents, optimistic row versions, workspace revision and metadata; this is not a fully normalized order/payment schema. Database migrations and the explicit import/verification tool are described in backend/README.md. UI migration does not import, reset or rewrite data.

Server permissions remain admin, reader and assigned-client grants. Full departmental dashboards require workspace access; assigned users use the resource-scoped API. Staff viewing filters are business filters, not security boundaries. Management and the Zoho Measurement feed remain read-only. Mutating React modules own explicit saves, bounded stale-write retries and failure states; shared/runtime.js exposes no persistence API. Same-client concurrent edits still need careful review; no new field-level collaborative merge is claimed.

Port 4300 remains the separate local JSON engine with atomic revision commits and its own optional workspace authentication. Do not expose that development HTTP server publicly. The old online/vercel encrypted snapshot tooling is not a supported live multi-user deployment. Production hosting, TLS, backup recovery and resource-policy sign-off remain separate release work.

Factory email automation stays disabled in active Design; provider tests are mocked. No migration test should send live emails, create real signatures, approve payments or write Zoho data.
