# Workflow and responsive verification — 21 October 2026

Scope: local browser and regression checks before deployment. No cloud deployment, live payment approval, customer record edit, factory delivery or signature request was performed.

## Isolation and reproduction

Run `.venv/Scripts/python.exe -B scripts/serve_workflow_qa.py`, then open `http://127.0.0.1:4303/login`. Every run creates a new synthetic SQLite database under ignored `.local/workflow-qa-<id>/`, using real FastAPI routes, authorization, persistence and compiled React assets. It does not use the active PostgreSQL database. Use `admin@qa.invalid` or `reader@qa.invalid` with `synthetic-qa-only`; these identities exist only in this loopback QA process, not in the CRM database. Never deploy this helper.

The synthetic Measurement provider returns four requests. Its private `measurement-mode.txt` can contain `error`, `empty` or `normal` to exercise recovery. Signature/transcription actions are denied and factory delivery is blocked by the real server endpoint. Stop the QA server with Ctrl+C. Existing fixture directories are retained for inspection, not automatically deleted.

Separately, backend integration tests ran against unique schemas in local Supabase PostgreSQL, including real local private Storage upload/download. Browser SQLite evidence is not presented as PostgreSQL end-to-end evidence.

## Browser evidence

| Area | Checks performed |
|---|---|
| Login/session | Invalid password feedback, valid login, sign out, unauthenticated Accounts redirect, reader sign-in |
| Sales | New opportunity required-field validation; synthetic opportunity creation and reload persistence; acceptance blocked until a client conversation is recorded; mobile form scrolling; payments, client tracker, incentive and team navigation; reader creation disabled |
| Accounts | Missing-client payment validation; one ₹59,000 bank receipt against ₹1,18,000 total; 50% approval threshold; Booking approval persisted; Production/Factory/Dispatch gates remained unavailable below their prerequisites; reader payment controls disabled |
| Accounts export | Master-data download produced a CSV with 52 columns and five synthetic client rows; wide master table uses its own horizontal scroll area |
| Design | Proposal positive-estimate validation; promised-date edit persisted and visible after reload/navigation; mobile proposal fields; reader date/upload/send disabled; post-design board, collections, factory and tracker navigation |
| Measurement | Search and no-match state, clear filters, request details, read-only notice, map drill-down with four exact-coordinate requests, reports, provider-error screen, retry recovery into a genuinely empty feed |
| Management | Overview, people/client/analysis navigation, person selection, client drill-down; money detail reflected the Accounts receipt (₹59,000 collected against ₹59,000 booking share); no edit controls |

Synthetic backend assertions confirmed exactly five clients and exactly one ₹59,000 receipt after browser actions. Factory send returned 403; signature provider was off. Reader `PUT /api/store` returned 403. A preliminary probe used POST (not the write contract); it was corrected to PUT before recording authorization success.

## Mobile fixes

1. Management: the shared top-bar selector overrode the mobile wrapping rule. At 320px the department navigation collapsed to a tiny strip. A properly scoped selector now gives navigation a full row; the read-only badge no longer inherits notification-card styling.
2. Sales: My team summary kept five columns on phones, squeezing each card to a few characters. At widths up to 600px those cards now reflow into readable columns with safe text wrapping. Desktop layout remains unchanged.

Actual browser checks covered all five module home pages at 320, 390, 768 and 1280 CSS pixels. Document width matched the viewport in all 20 cases. Navigation remains horizontally scrollable where needed. Forms/dialogs, reports and master tables were additionally inspected at 320/390px; wide comparison tables deliberately retain internal scrolling. These checks use Chromium viewport resizing, not physical iOS/Android devices or a virtual keyboard.

Private evidence: `.local/workflow-responsive-matrix.json`, `.local/workflow-sales-mobile.png`, `.local/workflow-mobile-verified.png`. The screenshots use synthetic data. Browser console inspection returned no errors on the inspected post-design view.

## Automated results

- Sales 44, Accounts 26, Design 47, Measurement 18, Management 37, Auth 11: **183 tests passed**.
- Backend: **30 passed**, including local Supabase Storage. One existing Starlette/httpx TestClient deprecation warning remains.
- All six Prettier checks and TypeScript/Vite production builds passed. Sales and Management builds were rerun after their CSS fixes.
- `scripts/check.py` passed syntax, business-rule, authorization/concurrency and Measurement persistence checks.
- The automated workflow suites additionally cover DRF prerequisites, revisions, confirmed-versus-pending payments, financial rounding, booking/handover gates, EPT/appliance/PDI prerequisites, idempotent payments, stale saves, failed uploads, empty reports and session expiry. External delivery tests use mocks.

Initial Vite runs in the restricted Windows sandbox failed on temporary-file rename permissions before executing tests. The suites were rerun successfully with the required local execution permission; those failed starts are not counted as test passes.

## Data and remaining boundaries

The active CRM's 28 client documents still match the pre-audit SHA-256 baseline. Original data, uploads, backups, credentials and unrelated changes were preserved. No additional cleanup deletions were performed.

This closes the listed local representative-workflow and mobile checks, not every possible combination of customer state. Physical-device keyboard behavior, browser engines other than Chromium, hosted infrastructure, MFA/recovery, production credentials, monitoring, scheduled backups and hosted restore drills remain separate release gates. Factory emails stay disabled. The updated Docker image was subsequently rebuilt and verified; see [final deployment checklist](../FINAL_DEPLOYMENT_CHECKLIST.md) for image identity, preservation checks and remaining release gates.
