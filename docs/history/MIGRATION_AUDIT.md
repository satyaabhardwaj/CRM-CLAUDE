# Whole-CRM migration audit — 2026-10-19

## Outcome and inventory

All implemented active department screens and authentication UI now render with React + TypeScript. No active route loads the legacy Kit UI renderer, dashboard renderer or a DOM-to-React compatibility adapter. Existing data/API contracts and financial rules remain intact. This is a frontend migration audit, not a claim of a fully normalized database or production deployment.

| Area | Finding and resolution |
|---|---|
| Sales | All workflow forms, dashboards, trackers, incentive and architect screens already native React. Rechecked after removing the shared legacy renderer. |
| Design | Pre-design/Post-design forms, tasks, board, collections and tracker already native React. Factory email sender remains disconnected. |
| Accounts | Removed active common/pieces.js and pi/pi.js dependencies. Moved PI math/PDF generation to strict TypeScript pi.ts; existing native payment/approval controls call it directly. |
| Measurement | Replaced hand-built map popup elements/events with React portals. Leaflet still owns map geometry; React owns request buttons/text. |
| Management | Four views/eight reports already native React; still read-only. Rechecked with the data-only shared runtime. |
| Login/session | Migrated backend/web login form and injected Sign out control to backend/react. Existing credentials, cookie/session APIs and redirects preserved; duplicate-submit guard and bounded auth request timeouts added. |
| Shared Kit | Active entries now load shared/runtime.js: existing money/date/PDF/news helpers and data cache only. No h/app/card/legacy save/watch/redraw lifecycle. Guard tests prevent reintroduction. |
| Pre-sales/Post-sales | No implemented standalone UI exists. Design's similarly named stages are already covered. |
| AI/mail/sign | Server-side provider integrations, not independent UI screens. Existing native controls and server tests cover their contracts; no real outbound actions were run. |

Retained intentionally: shared rules/signals/people/PIN services, Measurement source-model (Zoho data normalization/selectors), Accounts master-columns (field selectors), Sales reports.js (PDF generation), Leaflet and jsPDF. These are data/calculation/vendor services, not legacy UI adapters. No blind rewrite of settled rounding, payment gates or source data was done.

Historical department legacy.html, old dashboard sources, shared/kit.js and backend/web/login.js/session.js remain reference/rollback files. Active pages do not load them. The old /login.js and /session.js URLs redirect to the compiled auth entries; current HTML uses /auth-assets directly so shared chunks resolve correctly. Backend source and secret files are not exposed by that public asset route. Old online/vercel encrypted snapshot publishing is not a supported live multi-user release and was not deployed.

## Changes and important behavior

- React auth keeps the original email/password endpoints, required labels, autocomplete, busy/error states and Sign out behavior. No account, password, role or permission was changed.
- Accounts PI drawing commands and PI history values are compared against the old generator for Booking, Production and Dispatch. Missing jsPDF now gives a retryable error instead of appearing to create a PI.
- Map popup text is React-escaped and buttons open the same read-only request details. Tests cover popup click and map cleanup.
- Global financial rules and lossless PostgreSQL client documents are unchanged. Runtime extraction is covered by formatting/date parity tests. No schema or data migration was needed.
- Current Design factory email automation remains disabled; no real emails/signatures/payment approvals were sent.

## Verification actually run

| Suite | Passed |
|---|---:|
| Sales React | 42 |
| Design React | 47 |
| Accounts React | 26 |
| Measurement React | 18 |
| Management React | 37 |
| Auth React | 11 |
| Frontend total | 181 |
| FastAPI backend | 12 |
| Foundation Python | 7 |
| Measurement Python | 6 |
| Measurement + shared-runtime Node | 8 |

All six frontend formatting checks and strict TypeScript/Vite production builds passed. scripts/check.py also passed Python/classic-JS syntax and the storage/concurrency smoke test. Backend tests used synthetic SQLite fixtures in this run; PostgreSQL integration is configured separately in CI and is not claimed as rerun here. One existing Starlette/httpx deprecation warning remains.

Browser checks on the actual authenticated localhost backend:

- Login: mobile layout, existing-session Sign out, incorrect-password message, correct existing-account login and redirect to Sales; no credentials logged or changed.
- Sales: all ten workflow/sidebar destinations, mobile new-opportunity form, empty-form validation and close; no opportunity created.
- Design: tasks, all five Pre-design views and five Post-design views, desktop tracker; navigation/rendering and expected real-data balances.
- Accounts: Summary, Clients, Daily payments, four approval groups, five payment-stage tabs and Master data; mobile payment form, empty-client validation, client money/PI controls; no receipt/approval/PI history written.
- Measurement: all four pages, search, live Zoho data and missing-coordinate state. Live sync scanned 7,951 orders and showed 113 requests (90 open, 23 done). No exact site coordinates were present; synthetic fixture verified cluster popup -> detail and close, reports, refresh outage and recovery. During outage the UI hides counts and displays the last successful sync rather than presenting stale counts as current.
- Management: all four views/eight analysis cards after the runtime switch. Live overview/report amounts remained consistent with the earlier verified baseline (481.67 lakh open orders, 110.42 lakh collected, 116.16 lakh booking outstanding).
- Desktop 1440x900 and mobile 390x844 were inspected where described above; do not interpret this as exhaustive coverage of every screen at every device size. Browser console checks on migrated live department pages reported no warnings/errors.
- Before/after checksums matched for all 28 local client records. Provider records were read only. No database import/reset or customer edits were used for testing.

Checks found and fixed an auth shared-chunk URL resolution issue. The initial PDF parity fixture failed only on millisecond differences in its two generated timestamps; freezing the shared clock made the complete comparison deterministic. Final suites above passed.

## Run and extend

Use Node 24 and the existing Python environment. For each directory below run npm ci, npm run format:check, npm test and npm run build with --prefix:

```
sales/react
design/react
accounts/react
measurement/react
management/react
backend/react
```

Then run:

```powershell
.venv/Scripts/python.exe -B scripts/check.py
.venv/Scripts/python.exe -m pytest backend/tests -q
.venv/Scripts/python.exe -B scripts/build.py
run-backend.cmd
```

Open http://127.0.0.1:4301/. The existing configured server is running there. Build auth assets before starting a clean checkout; generated assets are ignored in Git but included in the source release. CI builds/tests all six frontends on Windows/Linux; the backend job separately exercises PostgreSQL.

Future screens go in the owning department/react/src, with selectors/commands and tests beside that feature's existing modules. Share financial rules through shared services, never another department's screen or legacy DOM renderer. Keep authentication UI in backend/react and server access enforcement in backend. Architecture.md has the complete responsibility map.

## Release, rollback and limits

Release the complete built static assets with the matching backend code; include all auth chunks, not only login.js/session.js. Existing login and department route smoke tests must pass before promotion. The source ZIP is a local release artifact, not a cloud deployment. Production release remains a separate authorized operation.

Rollback through the previous complete application release is preferred. For a department-only rollback restore its legacy.html as index.html, which loads shared/kit.js and the original department scripts. For auth rollback restore the matching previous backend routes and login shell together with backend/web/login.js/session.js. Do not roll back, reset or reimport customer data for a UI rollback. Follow backend/README.md and OPERATIONS.md for database and attachment backups.

Known boundaries: retained JavaScript calculation/PDF services are intentional; legacy rollback code still exists on disk. Hosted release hardening, final resource policies, field-level concurrent-edit handling and any normalized database redesign are separate work. No live provider send or exhaustive browser mutation workflow was performed; those contracts were verified with mocked/synthetic tests.
