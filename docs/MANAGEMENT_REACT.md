# Management (Tavneet): native React migration

## Scope and structure

`management/index.html` now loads the compiled React entry. Overview, Sales person wise, Client wise, Full analysis and both person/client dialogs are native React + TypeScript. No legacy DOM renderer or compatibility UI adapter is loaded. Existing dark header, department links, report labels and calculations are retained.

- `management/react/src/App.tsx`: navigation, filters, polling, error boundary.
- `Pages.tsx`, `Analysis.tsx`, `Details.tsx`, `ui.tsx`: screens and accessible native dialogs.
- `model.ts`: typed report selectors and aggregation rules.
- `data.ts`: read-only snapshot loader; `types.ts`: integration contracts.
- `style.css`: Management-only responsive overrides.
- `management/react/tests`: model parity, data boundary and React interaction tests.
- `management/tests/react_fixture.py`: isolated synthetic browser server on 4306.
- `management/assets`: generated build, ignored by Git but included in source releases.

Add future reports as selectors in model.ts and components in Analysis.tsx; add calculation/parity tests. Do not import another department screen. Shared SalesLogic, Signals and People remain the existing calculation services. Management never saves client data or sends email.

## Preserved contracts

GET /api/store remains the source of real CRM data. No database migration, import, client edit or API contract change is involved. Shared normalization runs on a cloned snapshot, preserving stored records and unknown fields. Legacy token normalization follows existing SalesLogic behavior.

Overview and Client wise use the live qualified/design/token/booked cohort; bin is excluded. Full analysis includes post-design and lost clients and filters by lead-received date. Week starts Monday; previous-month filtering crosses year boundaries correctly. Team cards and Sales person wise intentionally show the whole team even when a Person filter is selected, matching the original UI. All eight reports, confirmed-receipt collection, booking balances, severity thresholds, revision counts and top-seven reasons retain legacy semantics.

Hash routes #overview, #people, #clients and #analysis support browser back navigation. Refresh uses bounded 20-second GET requests and four-second polling, paused while a dialog is open, the tab is hidden or a form control is focused. Invalid/error responses show a retry state; refresh failures retain the last good data with a notice. Server authentication/authorization is unchanged. Management has no mutation method, even for administrators.

## Install, run and verify

Use Node 24 and the existing Python environment:

```powershell
npm ci --prefix management/react
npm run format:check --prefix management/react
npm test --prefix management/react
npm run build --prefix management/react
.venv/Scripts/python.exe -B scripts/check.py
.venv/Scripts/python.exe -m pytest backend/tests/test_api.py -q
```

Run the configured authenticated backend with run-backend.cmd and open http://127.0.0.1:4301/management/. Backend credentials and database configuration are documented in backend/README.md. No new secret is needed. The existing local server also serves the same compiled entry on 4300.

CI now installs, format-checks, tests and builds Management. Build all five React frontends before `python -B scripts/build.py`. The source ZIP includes compiled Management assets, source, lockfile and this documentation, excluding local data, environment secrets and dependencies.

## Verification on 2026-10-19

- 37 Management tests passed: legacy report parity across all four date ranges, staff verdict thresholds, booking/collection math, cohorts, date boundaries, safe grouping keys, normalization immutability, GET-only/error handling, filters and dialog keyboard/focus behavior.
- Strict TypeScript and Vite production build passed; formatting passed after responsive styling correction.
- Existing project checks passed: syntax, 7 foundation tests, 6 Measurement Python tests, 5 Measurement JavaScript tests and storage/concurrency smoke check.
- Backend: 10 tests passed. Existing Starlette/httpx deprecation warning remains; no runtime failure.
- Authenticated live browser reports matched the baseline: open orders 481.67 lakh, collected 110.42 lakh, outstanding 116.16 lakh; full analysis 27 clients and 78% 24-hour response metric.
- Live client checksums before/after matched for all 28 records.
- Synthetic browser checks covered person/stage/problem/date filters, empty reports, whole-team semantics, person-to-client drill-down, Escape, browser back, initial and refresh errors, recovery, permission-denied state and updated fixture data. API audit contained only GET requests.
- Desktop 1440x900, tablet 768x1024 and mobile 390x844 layouts inspected. Tablet clipping fixed and rechecked; mobile page has no horizontal overflow, wide report tables scroll internally. Automated dialog tests cover focus restoration. Live page console had no errors or warnings at final reload.

These are local checks, not a cloud deployment or proof of every possible production dataset. No live payments, approvals, provider writes or emails were exercised. Design factory email sending remains disabled as requested.

## Release and rollback

Deploy the frontend assets with the existing backend/static release procedure; retain the previous release and database backups described in docs/OPERATIONS.md. No schema migration is required. Smoke-test authentication, /management/, all four report views and read-only data loading before promotion. Production release remains separate.

For a Management-only rollback, restore management/index.html from management/legacy.html and redeploy the unchanged dashboard.js, analysis.js and look.css plus existing shared services. Keep the React source for follow-up. Do not reset or restore client data for a UI rollback. Existing department URLs and other departments are unaffected.
