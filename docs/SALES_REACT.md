# Sales: native React migration

The active `/sales/` application uses React 19.2, TypeScript 5.9 and Vite 8. The remaining workflow forms and dashboards are now native JSX components. The `Widget`, `registry`, `manifest` and `workflows` compatibility adapters have been removed. No legacy Sales UI script is imported by the active entry point.

## Scope and structure

- `sales/react/src/App.tsx`: application shell, existing hash routes, Viewing/date/search filters, accessible dialog lifecycle and save status.
- `ClientForm`, `QualifiedForm`, `ContactForm`, `PersonalForm`, `DesignForm`, `OrderForms`, `OcfForm`: qualification, contact history, billing/people/addresses/multiple orders, DRF, proposals/revisions, signed proof, booking, payments, approvals, timeline and OCF forms.
- `Dashboards`, `lists`, `MasterPages`, `Tracker`, `Overview`: workflow lists, filters, team, architects, Bin/restore, board, summaries, notifications and side panel.
- `ArchitectPicker`, `ui`: shared native controls, blur/Enter commits, uploads and voice controls.
- `WhatsApp`: native app/copy-number actions; the existing helper-only hostname retains helper health, mirror, attachments and sending controls. TimelinesAI and side-by-side mode remain disabled as before.
- `commands`, `model`, `types`: workflow gates, typed feature data and state transitions.
- `data`: existing full-store contract, normalization, optimistic revision checks, conflict merge, dirty draft/retry and queued asynchronous completions.
- `reports.js` / `reports.d.ts`: extracted PDF content service with typed entry points. It intentionally preserves the original report content; it is JavaScript, not a DOM adapter. `sales/ocf/terms.js` and `sales/ocf/ocf.js` remain the existing pure PDF services.
- `sales/react/tests`: native component, workflow, calculation boundary and persistence regression tests.
- `sales/tests/react_fixture.py`: isolated synthetic browser server on loopback port 4304. It never loads production data or sends mail/signatures.

The existing shared `Kit`, `People`, `Pin`, `Signals` and `SalesLogic` services remain dependencies. Shared financial rules, backend endpoints, database schema, login and other departments were not changed by this phase. Legacy Sales source plus `sales/legacy.html` remain available only for rollback.

## Contracts preserved

Bank/free-accessory percentages, GST on the bank amount, architect success fees, plan shares, booking balance and timeline dates continue to use `shared/rules.js`. Requested receipts are not counted as confirmed collections. Design approval still requires signed proof and the existing workflow gates; booking handover still requires the booking share. Existing client IDs, custom fields, upload references and related-order groups are preserved.

Fields commit on blur or Enter without duplicate commits. Drafts survive save failure; the user can retry or explicitly discard. File/PIN/signature callbacks that finish during a save are queued until it succeeds. Buttons are disabled during a pending change and for read-only roles; authorization remains enforced by the existing backend.

Small correctness fixes made during conversion: native date fields commit their actual input value; failed uploads can retry the same file; billing IDs advance beyond the largest existing suffix; new related orders do not inherit another order's receipts, signatures or completion gates. Signature auto-send persists its attempt marker before sending, checks that it was not discarded, and does not automatically retry an uncertain send. This is not an exactly-once delivery guarantee.

## Install, test and run

Use Node 24 and the existing backend environment. No data import or migration is required.

```powershell
npm ci --prefix sales/react
npm run format:check --prefix sales/react
npm test --prefix sales/react
npm run build --prefix sales/react
.venv/Scripts/python.exe -B scripts/check.py
.venv/Scripts/python.exe -m pytest backend/tests -q
```

Run the configured authenticated backend with `run-backend.cmd`; Sales is served at `http://127.0.0.1:4301/sales/`. `run.cmd` is the existing separate local single-user server on port 4300. Do not start a second copy on an occupied port. Configuration and private credentials remain in the existing ignored local files.

For synthetic browser checks run `python sales/tests/react_fixture.py`, then open `http://127.0.0.1:4304/sales/`. `.local/sales-test-mode.txt` accepts `normal`, `readonly`, `error-load`, `error-save`, `conflict` and `lost-response`. The fixture starts fresh synthetic data on each launch and writes its last saved state to `.local/sales-fixture.json`. These files are not production data and are excluded from releases.

## Verification: 19 October 2026

- Native Sales: 42 tests pass (three files), including required-field gates, related orders, proposals/revisions, booking/payment boundaries, billing IDs, native input commits, all ten dashboard render paths, save conflicts, retained drafts, queued upload completion, unknown-field preservation and PDF report equivalence against the original report service.
- Strict TypeScript check and Vite production build pass. Prettier check passes.
- Repository check passes: Python syntax, 81 classic JavaScript files, 7 foundation tests, 6 Measurement Python tests, 5 Measurement model tests and the storage preservation check. The ES-module report service is checked by Vite and its parity test, rather than parsed as a classic script.
- FastAPI: 10 tests pass. The existing Starlette/httpx deprecation warning remains.
- Synthetic browser: call validation/logging, lead acceptance, completed DRF/send, proposal approval, requested payment validation, booking submission, save failure/retry, OCF missing-email error, billing/contact/address edits, additional order creation, architect creation/selection, percentage calculations, soft-delete/restore, read-only role and initial-load outage/recovery verified.
- Browser financial example: OBV 100,000, bank 80%, accessories 10% gives GST 14,400, payable 116,400; architect 5% gives success fee 5,000 and net inflow 97,000. Requested payment remains excluded from confirmed collection.
- Client PDF downloaded successfully. Failed upload showed an error and retained the existing proof links.
- Mobile 390px and tablet 768px inspected, including billing forms, incentive, architect master and mobile sidebar access. The mobile client dialog had no horizontal overflow.
- Authenticated live backend loaded the existing Sales records. All 28 live client documents have identical before/after SHA256 comparison results. Test writes went only to the synthetic fixture.

External WhatsApp desktop/helper sending, screen sharing, microphone/AI transcription and real Zoho Sign delivery were not executed. The local signature provider reports disabled. Those integrations need provider/device smoke tests in an authorized environment; the migration does not claim external delivery verification or production readiness. The existing incentive definition still leaves its 70% basis unset; the UI continues to say so rather than inventing a calculation.

## Future changes, release and rollback

Add new forms to `sales/react/src` and keep their transitions in `commands.ts`. Reuse the shared financial rules instead of duplicating formulas. Extend native regression tests for each business gate and use the synthetic fixture for edits that would otherwise alter customer data. Do not reintroduce DOM widgets or legacy Sales registries.

Build Sales before packaging/deployment and ship `sales/index.html` with the complete generated `sales/assets` directory. Existing CI runs the Sales formatting, tests and build. Keep the backend/authentication configuration unchanged for this frontend-only release. A production deployment is a separate action.

For UI rollback, preserve the React entry and copy `sales/legacy.html` over `sales/index.html`, then reload. No database rollback is needed or appropriate. To restore React, restore its entry and rebuild its assets. Never restore an older data snapshot just to roll back the UI.
