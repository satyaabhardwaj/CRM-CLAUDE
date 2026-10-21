# Measurement React migration

## Scope and behavior

The active `/measurement/` page is now React 19.2.4 + strict TypeScript 5.9.3, built with Vite 8.3.4. Home, Requests, Areas, Reports, filters, request details and notifications render through React. Existing CSS tokens and Measurement-only layout rules retain the compact navigation and white-card design.

The server contract is unchanged: `GET /api/measurement/requests` (optional `?refresh=1`), same-origin session cookie, existing FastAPI authorization and server-only Zoho credentials. No data import, schema migration, account reset or Zoho write is performed by this phase. Other department implementations remain unchanged.

All four visit stages, status counts, search, combined filters, sort, show-all, exact-coordinate map clusters, CSV/PDF exports and read-only source details are retained. Five-minute refresh pauses during dialogs and focused controls; requests have a two-minute timeout and a duplicate-request guard. Failed syncs hide stale counts and retain the last successful timestamp. Expired sessions redirect to login; forbidden access shows an explicit error.

The typed adapter deliberately reuses `common/source-model.js` for existing deterministic filtering, sorting and map clustering. It normalizes Completed to Done, keeps measurement assignee separate from owner, validates dates and coordinates, and never infers exact coordinates from a city. `shared/kit.js` is loaded only for the existing PDF helper; the legacy shell/DOM renderer is not started. Notifications retain Sales/Design sources and the existing optimistic `/api/store` seen-marker save. Readers can view notifications; a denied seen-marker save is reported without granting write access.

The old local task/problem editing screens remain in the legacy implementation/test fixture. They were not enabled in the live Zoho UI and are not newly connected to Zoho. Scheduling/status updates still happen in Zoho.

## Structure

```text
measurement/
  index.html                 React entry, existing public URL
  legacy.html                previous live UI entry for rollback
  react/
    package.json, package-lock.json
    tsconfig.json, vite.config.ts
    src/
      main.tsx               shell, hash routing, page composition
      api.ts                 fetching, refresh, timeout, auth errors
      model.ts               typed API adapter, counts, safe CSV
      components.tsx         cards, rows, dialogs, details, stats
      Filters.tsx            validated filter draft form
      pages.tsx              overview, requests, reports
      Areas.tsx              lazy-loaded Leaflet map and area groups
      Notifications.tsx      department notices
      style.css              scoped additions, responsive details
    tests/                   model, rendering, API lifecycle tests
  assets/                    generated production JS/CSS; Git-ignored
  backend/                   unchanged Zoho connection and mapping
  common/source-model.js     shared, tested deterministic selectors
  vendor/                    existing map CSS/outline and licenses
  tests/react_fixture.py     isolated browser scenarios, no real data
```

Keep new Measurement UI in `react/src`, API normalization/business rules in `model.ts`, and provider access in `backend/`. Components must not receive credentials or fetch Zoho directly. Use existing CSS tokens; do not change shared styles for one department. Preserve the `#stage/page` URL format. Add meaningful model/API tests when changing mapping or workflows. A later selector conversion to TypeScript can remove the compatibility adapter after parity tests pass.

## Install, run and verify

Use Node 24 and the existing Python backend environment. From the project root:

```powershell
npm ci --prefix measurement/react
npm run format:check --prefix measurement/react
npm test --prefix measurement/react
npm run build --prefix measurement/react
.\run-backend.cmd
```

Open `http://127.0.0.1:4301/measurement/` and use the existing local admin login. Existing backend configuration and Zoho credential file remain in place; no `VITE_*` secret or new login provider is required. Rebuild after frontend edits and reload the browser. For the separate single-user legacy server, `python -B measurement/server.py` serves the same compiled page on port 4300.

Additional checks:

```powershell
python -B scripts/check.py
.venv/Scripts/python.exe -B -m pytest backend/tests -q
npm audit --prefix measurement/react
python -B scripts/build.py
```

The last command packages source plus compiled assets into `dist/crm-source.zip`, excluding data, credentials, dependencies and private local settings. CI runs npm clean install, formatting, tests and production build on Windows and Ubuntu before packaging. Generated assets must exist before source packaging.

For isolated browser tests, run `python -B measurement/tests/react_fixture.py`, then open `http://127.0.0.1:4302/measurement/`. The fixture only serves synthetic data. Set `.local/react-test-scenario.txt` to `normal`, `empty` or `error`, then click Refresh/Try again. Stop the fixture after testing. Never run it as the real CRM service.

## Release and rollback

Build in CI, deploy the `measurement/index.html`, compiled `measurement/assets/`, required shared/vendor assets and existing backend together. Do not deploy node_modules, TypeScript source as executable assets, private env files or test services. Publish a complete release directory atomically; retain previous hashed chunks during the rollout so an already-open page can still load its map. Smoke-test login, Measurement/API, filters, map and exports. This phase has no database migration; existing backup/recovery procedures remain applicable.

For immediate UI rollback, copy `measurement/legacy.html` over `measurement/index.html` and reload. Keep all old Measurement scripts until the React release is accepted. This changes only the HTML entry and does not restore/overwrite any client data. To return to React, restore the React entry from the release and its matching assets.

## Verification (19 October 2026)

- Strict TypeScript check + production build passed; map code is a separate lazy chunk.
- 17 Vitest checks passed: mapping/count/filter parity, invalid dates/coordinates, CSV formula escaping, safe rendering, load/error/retry/empty/403/401 behavior, deduplicated fetch and unmount cancellation.
- Existing foundation: 7 Python tests, 6 Zoho connection tests, 5 JavaScript business-rule tests, and isolated storage persistence/stale-write check passed.
- Backend: 10 tests passed against isolated SQLite fixtures. Existing upstream Starlette/httpx deprecation warning remains; PostgreSQL-specific tests were not repeated in this frontend phase.
- npm audit: zero reported vulnerabilities across runtime and development dependencies after patched Vite/Vitest updates.
- Actual authenticated page: 7,942 orders scanned, 113 requests (90 open / To Schedule, 23 done). Counts matched the legacy UI and authenticated API at verification time; future syncs may change them.
- Browser: search, real request details, Escape dismissal, stage validation, combined PDI+Done filter (18), filtered reports, PDF success feedback, downloaded CSV with four stage rows and PDI Done=18, areas/grouping and empty search checked.
- Responsive: actual 390px and 768px viewports had no document horizontal overflow; mobile filter dialog fitted its viewport.
- Synthetic browser fixture: exact-coordinate cluster popup, request details, show-on-map, fit sites, outage hiding counts and retry to a valid empty result checked. Live records currently have no exact coordinates, so marker interaction cannot be verified with live sites.

No hosted production deployment was performed. PDF generation returned success in the browser; PDF page-by-page visual fidelity was not reviewed. Existing multi-user deployment and credential setup limitations remain in the backend operations documentation.
