# Accounts React migration

Accounts is served at `/accounts/` by the existing servers (authenticated FastAPI on port 4301; local compatibility server on 4300). React 19, TypeScript 5.9 and Vite 8 replace its page renderers. Other departments and the shared financial engine are unchanged. No database migration or customer-data import is required.

## Structure and future changes

- `accounts/react/src/main.tsx`: department navigation, existing hash routes and client dialogs.
- `pages.tsx`: summary, clients, daily payments, stage queues, approvals and Master.
- `payments.tsx`: payment forms, gate actions, PI downloads and decisions.
- `components.tsx`, `Notifications.tsx`, `style.css`: accessible shared Accounts UI, notifications and scoped styling.
- `model.ts`: typed financial adapters and validated pure commands; financial calculations continue to use `shared/rules.js`.
- `store.ts`: authenticated API reads, optimistic revision handling, refresh and operation deduplication.
- `accounts/common/master-columns.js`: the existing 52 Accounts Master column definitions, extracted without changing their calculations.
- `accounts/pi/pi.js`: existing PDF generation retained for document parity.
- `accounts/react/tests`: business rules, conflict handling, permissions and component regression tests.
- `accounts/tests/react_fixture.py`: loopback-only synthetic browser server; never sends email or edits customer data.
- `accounts/assets`: generated, ignored production bundle. `accounts/legacy.html` retains the original entry point for rollback.

Add Accounts features to these modules; keep JSX out of financial commands, API writes out of rendering, and department styling scoped. Shared finance changes require cross-department regression tests. Preserve unknown client fields and the existing IDs and receipt status contracts.

## Install, run and release

Use Node 24 and the committed lockfile:

```powershell
npm ci --prefix accounts/react
npm run format:check --prefix accounts/react
npm test --prefix accounts/react
npm run build --prefix accounts/react
run-backend.cmd
```

Build includes strict TypeScript checking. Backend configuration, PostgreSQL startup and login remain documented in `backend/README.md`. Rebuild after source changes; the backend serves the resulting static assets directly. Build Measurement too before `python -B scripts/build.py`. CI performs clean installs, formatting, tests and builds for both frontends before the existing Python checks and release ZIP.

## Data and behavior

Summary, receipt allocation, booking/production/dispatch percentages, bank/management amounts, stage dates, PDI prerequisites, PI rounding and Master fields use the existing rules. Existing hash URLs and navigation are retained. Requested/rejected receipts remain excluded from confirmed collections.

Writes fetch the latest snapshot and reapply one validated command to its target client. Revision conflicts retry at most three times, rerunning eligibility checks. Other clients and unknown fields survive. An operation ID stored with the client prevents duplicate receipt writes when retrying the same retained form after a lost response. This does not persist an unsaved form across navigation or reload. Keep an unresolved form open and use its Retry action.

Factory approval persists before attempting its existing mail action. Mail failure or an unknown delivery outcome is shown separately; approval is not silently undone and mail is not automatically retried. This is not a transactional email outbox or an exactly-once delivery guarantee. PI history is saved after download; a history-save failure is reported separately.

Reader actions are disabled and the existing server still enforces admin-only store writes. Assigned-user dashboards remain unsupported by the global store contract. Financial guards in this frontend do not replace server-side command authorization: dedicated payment/approval endpoints, finer department permissions and an email outbox remain future backend work. Existing business choices, including bank-only PI values and previously approved gates remaining approved after later order changes, were not silently altered.

## Verification (19 October 2026)

- 22 Accounts tests pass: legacy calculation parity, amounts/dates, allocation, PDI/payment gates, stale decisions, CSV escaping, read-only controls, empty state, auth failure, optimistic conflicts and lost-response deduplication.
- TypeScript and production build pass. Dependency audit reports zero vulnerabilities.
- Backend: 10 tests pass; existing Starlette/httpx deprecation warning remains.
- Browser: live summary matches the previous UI (18 orders; payable 731.30 L, received 309.32 L, balance 421.98 L).
- Isolated browser fixture: payment validation/save/reload, booking approval, receipt rejection, production/factory/dispatch gates, concurrent edit preservation, failed-save retry, read-only controls and actual PI PDF download verified. Mail used a fake provider; no real email was sent.
- Mobile 390 px and tablet 768 px checked for layout/overflow. Synthetic persisted data assertions verify amounts, decisions, gates, PI history and preservation of unrelated fields.
- API outage and automatic recovery, empty search and mobile detail dialog verified in-browser. All 28 live client documents have identical before/after SHA256 hashes.
- Clean lockfile installation, formatting, repository syntax/API/Measurement checks and source ZIP verification pass; packaged output includes the React source/assets and excludes private data and dependencies.

Local evidence only; no hosted deployment or real financial mutation was performed for these tests.

## Rollback

Keep a database backup under the existing operations policy. To roll back only the UI, save the React `accounts/index.html` and copy `accounts/legacy.html` over it, then reload the browser. Keep all existing legacy scripts. There is no reverse data migration; additive operation IDs are ignored by legacy readers. Do not restore an old database snapshot merely to revert the UI. Restore the React index and rebuild its assets to return to React.
