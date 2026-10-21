# Local foundation verification — 20 October 2026

## Completed local cutover — 21 October 2026

Single-click launcher subsequently verified: `Start CRM.cmd` starts Docker Desktop,
the existing local Supabase stack and CRM, then opens the default browser. Tested
with services already running and with CRM, Supabase and Docker Desktop stopped.
Cold start completed successfully, all published ports remained loopback-only,
CRM had one listener, browser Sales loaded and authenticated comparison confirmed
28 clients unchanged. Six focused startup/launcher tests passed. The launcher
does not initialize, reset, migrate or deploy data and does not replace `.env.local`.

This section supersedes the historical pending-cutover notes below.

- Docker Desktop's `PortBindingBehavior` was changed to
  `default-local-port-binding` after privately backing up its settings. After
  restarting Docker, all published Supabase ports were verified as 127.0.0.1/::1;
  the activation guard passed. No unrelated running containers were present.
- With the CRM stopped, a fresh source backup was created and restored into a
  separate rehearsal database: 8 tables (including Alembic) and 15 attachments.
- Copied all 7 CRM tables, including existing password hashes, sessions and role
  grants, plus 28 clients and 15 attachments. All rows and attachment bytes matched.
- Activated ignored `.env.local`. Running CRM uses Supabase Storage and database
  port 56322. Source database and original uploads were rechecked against the
  source backup and remain unchanged.
- Supabase backup completed with 8 tables and 15 attachment files. Database dump
  was restored to a separate rehearsal database and table hashes matched; backup
  attachment hashes matched live Storage. This did not overwrite either live DB.
- Authenticated CRM download checks verified all 15 attachments against hashes.
- Backend tests using local PostgreSQL and real private Storage: **25 passed**,
  no skips, one existing Starlette/httpx deprecation warning. Synthetic tests
  include roles/permissions and private signed upload/download/public denial.
- Actual browser login with the preserved admin credentials reached Sales.
  Authenticated API comparison confirmed all 28 client records unchanged.
- Factory email remains disabled. No cloud deployment or project creation occurred.

Private backups: `.local/backups/pre-supabase-20261021` and
`.local/backups/supabase-20261021`, each with `database.dump`, `uploads/` and a
verified `manifest.json`. Retain these privately; do not commit or upload them.

After reboot: start Docker Desktop, run `npm run db:start`, then
`run-backend.cmd`. The app URL remains http://127.0.0.1:4301. Never run `db reset`
or `stop --no-backup` on this data-bearing local stack. See the setup guide's
rollback section; new post-cutover writes must be reconciled before reverting.

## Historical preparation results

No cloud deployment, hosted Supabase project, or new Vercel project was created.

## Completed checks

- All six production frontend builds passed through the root build script,
  including TypeScript checks. The revised shell-free build runner was used.
- Frontend suites: Sales 44, Design 47, Accounts 26, Measurement 18,
  Management 37, Login 11: 183 passing tests across this implementation task.
- Backend SQLite suite: 21 passed; opt-in Storage test skipped in that run.
- Local Supabase PostgreSQL 17 suite with real private Storage enabled:
  **22 passed**, one existing Starlette/httpx deprecation warning.
- Storage check uploaded and downloaded a synthetic 5 MB file through signed
  URLs, checked listing and denied public access, and removed the test object.
- Supabase bucket SQL and all CRM Alembic revisions applied successfully to the
  empty local development database. API tests used isolated synthetic schemas.
- Sales formatting check passed after formatting the new upload test file.
- Python compilation passed for backend and changed setup/migration/backup tools.
- Browser: existing admin login and Sales, Design, Accounts, Measurement and
  Management pages loaded. Measurement completed a live Zoho scan of 7,951 orders.
- After restarting the updated backend, authenticated API comparison confirmed
  all 28 existing client records unchanged. Signature provider remained disabled.
  Factory-email denial is covered by backend tests; no factory email was sent.

## Local cutover is deliberately pending

Docker Desktop published the Supabase ports on `0.0.0.0` and `::` despite the
loopback Docker network option. The configuration generator correctly refused
activation. **No customer records, passwords/sessions or existing attachments
were copied to Supabase.** The running CRM still uses its original local
PostgreSQL database and private upload directory; `.env.local` is not activated.

Select Docker Desktop **Settings > Resources > Network > Port binding behavior >
Localhost by default**, apply it, and restart this project's Supabase stack.
Verify published ports are loopback-only before running the documented copy and
reconciliation. Supabase services were stopped with volumes preserved while this
setting is pending. The original CRM continues at http://127.0.0.1:4301.

The updated Supabase-aware backup tool still needs a restore rehearsal with the
actual copied customer data after cutover. The previous original-database backup
and restore rehearsal is retained privately; it is not evidence of a Supabase
customer-data restore. No mobile layout change was made or new mobile verification
claimed in this phase. Hosted behavior and Python 3.12 CI execution remain pending;
local Python checks used the installed Python 3.11 environment.

## Previous Vercel project

The old snapshot publisher is disabled and its original source privately backed
up. The confirmed old main project is `magppie-crm`; its cloud deletion remains
pending because the Vercel connector requires the user to confirm in its dashboard.
The helper and unrelated projects were left untouched. Fresh configuration is
unlinked and Git auto-deployment is disabled.

See [setup, architecture and rollback](VERCEL_SUPABASE.md) for the next commands.
