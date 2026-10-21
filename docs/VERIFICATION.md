# Verification evidence (19 October 2026)

Executed locally on Windows with Python 3.11.9 and Node 24.18.0:

- `python -B scripts/check.py`: Python AST parsing, application JavaScript syntax checks, seven foundation API tests, six Zoho adapter tests, five Measurement model tests and isolated storage persistence check. Socket tests require localhost access; sandbox-only execution initially failed with WinError 10013, then passed outside that restriction.
- Foundation coverage: GET/HEAD private file denial, encoded paths, directory listing denial, origin/host checks, disabled reset, optional admin/reader authorization, concurrent revision conflicts, schema/duplicate-ID validation and prior-revision recovery copy. Added request size, READ_ONLY, unknown upload owner and rate-limit cases.
- `/test/rules-tests.html`: 59 passed, 0 failed in the actual browser. A currency encoding regression found during verification was fixed before delivery.
- `/test/save-errors.html`: synthetic failed save shows a visible alert, enabling recovery and retry removes it. No production API writes.
- Live localhost: health and Sales/Design/Accounts/Management/Measurement return HTTP 200. Zoho read-only sync returned 7,942 orders and 112 measurement requests (89 open, 23 done).
- Measurement browser: real dashboard renders after loading; mobile viewport 390px has document width 390px. Existing stage and page navigation retained. Client store hash unchanged across restart.
- Source packaging: deterministic archive excludes data, credential files, environment path pointer, .git and legacy backups. No live snapshot generated or uploaded.

## Limits

No cloud CI run or hosted deployment is claimed. No production build exists for a server framework: this app serves source assets directly; build.py packages source. No TypeScript/compiler or lint dependency was invented; syntax validation and git diff whitespace checks are used. No exhaustive accessibility audit or complete department-wide E2E suite was performed. External email/signature sends were not tested because they would contact real recipients. Backup restoration has not been rehearsed against production data. Bundled dependency vulnerability review and hosted multi-user security remain release gates in OPERATIONS.md.
