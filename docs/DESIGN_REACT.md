# Design: native React migration

`/design/` now uses React 19.2.4, TypeScript 5.9.3 and Vite 8.3.4. All Design screens and forms are native JSX. No Design DOM adapters, `DesignParts`, `Kit.app`, or legacy Design UI scripts are loaded by the active entry point. The existing shared CSS, people/date helpers and financial/workflow rules remain in use.

## Structure and extension points

- `design/index.html`: shared services and compiled React entry. `design/legacy.html`: unchanged legacy entry for rollback.
- `design/react/src/App.tsx`: department navigation, hash routes, filters, accessible dialog lifecycle, polling and persistence status.
- `Pages.tsx`, `Overview.tsx`, `Facts.tsx`: task lists, pre-design lists, post-design board, PDI, collections, factory, tracker, summaries, side rail and notifications.
- `Forms.tsx`, `ClientForm.tsx`, `ui.tsx`: proposal, timeline overwrite, site measurement, design, appliance, EPT, PDI and client-detail controls. Drafts survive closing/reopening within the page session. Inputs save on blur/Enter; explicit workflow actions remain buttons.
- `commands.ts`, `selectors.ts`, `model.ts`, `types.ts`: typed transitions, selection and view data. Add future Design business transitions here and regression tests beside the existing tests. Shared financial policy changes belong in `shared/rules.js`, not copied formulas.
- `data.ts`: existing `/api/store` contract, revision checks, safe rebasing of unrelated changes, failed-save retry, discard, read-only mode and queued asynchronous upload completions. Unknown client fields and cross-department records are preserved.
- `factory.ts`: prepared/mock-tested email sender, deliberately **not connected to the entry point** at the user's request. Do not enable as incidental cleanup.
- `design/react/tests`: component, workflow/parity and persistence tests.
- `design/tests/react_fixture.py`: loopback-only synthetic browser fixture, port 4305; never reads real client data or contacts external providers.

Other departments, database schema, backend contracts, credentials and shared calculation rules were not changed by this phase. Build/check scripts, CI and README were updated only to include Design.

## Preserved workflows and contracts

Existing `#today`, `#pre/make`, `#pre/timelines`, `#pre/sales`, `#pre/booking`, `#pre/all`, `#post/board`, `#post/pdi`, `#post/collections`, `#post/factory` and `#post/tracker` routes remain. Designer/date/search filters and department navigation remain.

Proposal amounts/version history/attachment references and Sales handoff, timeline before/after history, measurement request/note, design approval/returns, appliance list/signature/returns, EPT send/return/signature counts and PDI visits/approval are preserved. Measurement completion stays owned by Measurement. Drawing and factory approvals stay owned by Accounts. Financial totals, confirmed receipts, plan shares, collection amounts, dates, readiness and gates use the unchanged shared rules.

PDI approval can move an already Accounts-approved, 80%-collected order into Factory. This records a queued mail status but **Design does not send that email**. The UI states that automatic sending is disabled. Existing Accounts mail behavior was not modified. The prepared sender persists a revision-checked claim before delivery, never retries an ambiguous send automatically, and is tested only against mocks. This is not an exactly-once mail guarantee; enabling it is a separate explicitly authorized change.

Small reliability improvements: invalid/non-positive proposal totals are rejected, incomplete timeline dates are rejected, upload failures retain drafts and allow selecting the same file again, pending saves disable mutations, dialogs support Escape/focus restoration, readers can inspect details without making changes, mobile menus close on navigation, and tables scroll within their card.

## Install, run, test, build

Use the existing Node 24 and Python backend environment; no data migration/import/reset is needed.

```powershell
npm ci --prefix design/react
npm run format:check --prefix design/react
npm test --prefix design/react
npm run build --prefix design/react
.venv/Scripts/python.exe -B scripts/check.py
.venv/Scripts/python.exe -B -m pytest backend/tests/test_api.py -q
.venv/Scripts/python.exe -B scripts/build.py
```

Run the authenticated app with the existing `run-backend.cmd` configuration and open `http://127.0.0.1:4301/design/`. Existing servers already serve updated compiled files; reload the tab after a build. `run.cmd` remains the legacy local server on 4300. Do not expose the unauthenticated local server publicly.

For isolated manual browser checks:

```powershell
.venv/Scripts/python.exe design/tests/react_fixture.py
# Open http://127.0.0.1:4305/design/
```

Fixture modes are selected in ignored `.local/design-test-mode.txt`: `normal`, `readonly`, `error-load`, `error-save`, `error-upload`, `conflict`, `lost-response`. Synthetic persistence is written to `.local/design-fixture.json`. Restart the fixture to reset invented records; never substitute a production snapshot. Close the fixture process when finished.

## Verification (19 October 2026)

- Design Vitest: 47 passed. Includes native forms, date commits, draft retention, read-only notifications, route empty states, proposal versions/validation, timeline audit, measurement idempotency, approval gates, legacy task/filter parity, collections, conflict/retry/lost-response/queued saves and mocked factory delivery.
- Strict TypeScript and Vite production build passed; formatting check passed.
- Repository check: Python syntax, 81 classic JavaScript files, 7 foundation Python tests, 6 Measurement Python tests, 5 Measurement JavaScript tests, plus storage persistence/stale-write check passed.
- Backend: 10 pytest tests passed against isolated SQLite fixtures. One existing Starlette/httpx deprecation warning remains. A preliminary unittest discovery ran zero tests; pytest above is the actual backend test evidence. PostgreSQL-specific CI was not rerun locally in this phase.
- Actual browser: all 11 Design routes, proposal validation/draft retention, failed/successful attachment upload, failed save and retry, timeline overwrite, measurement note autosave, design -> appliances -> EPT -> PDI sequence, Accounts gate blocking, reader-disabled mutations, load failure/retry and responsive desktop/tablet/mobile views were exercised with synthetic records. Native dialog labels and keyboard behavior were checked. This is targeted accessibility verification, not a complete WCAG audit.
- Live 4301 read-only parity: 11 tasks, 15 pre-design clients, 8 post-design clients; collection summary INR 188.18 L of INR 222.50 L (85%), matching the legacy baseline. All 28 existing clients retained the same canonical checksum after verification. No live client edits or provider mail/signature actions were performed.

## Release and rollback

CI installs, checks and builds Design alongside the other React departments on Windows/Linux. Build all four frontends before `scripts/build.py`; the source release includes Design source/locks/compiled assets and excludes real data, secrets, `.local`, and `node_modules`. CI configuration was prepared locally; no hosted deployment or remote CI result is claimed.

For a release, take the normal database/upload backup, build from locked dependencies, deploy the source package through the existing backend process, then smoke-test login, Design routes and reader access. There is no database migration in this phase.

For a UI rollback, restore `design/index.html` from `design/legacy.html` and reload. Keep all data/uploads and other departments unchanged. Do not reset the database or discard the repository's unrelated uncommitted work. Legacy files remain only for rollback and should not be extended alongside React.
