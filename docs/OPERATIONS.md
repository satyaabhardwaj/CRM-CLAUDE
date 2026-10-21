# Operations and release

## Environments and configuration

`CRM_ENV=development` is the only supported local-server environment. The integrated launcher refuses other values. Loopback binding is fixed. `PORT` defaults to 4300; `HOME_PAGE` defaults /sales/; `READ_ONLY=1` blocks mutation endpoints. `.env.example` lists placeholders. Load real credentials through process environment or ignored service-specific files; do not paste them in logs or bundle them. Measurement supports an external environment file and its existing ignored local path pointer.

Health: GET `/api/health` returns 200 with schema version when stored JSON is valid, 503 otherwise; no data or credentials. With authentication enabled, health checks also need an authorized account. Request contents/query strings are not logged. Provider status failures return errors; external side effects must never be automatically retried after an ambiguous response. Zoho reads have bounded pagination, timeouts and one token refresh retry; no CRM writes.

## Build / CI / preview

Run `python -B scripts/check.py`, then `python -B scripts/build.py`. Extract the source archive into a NEW directory, configure secrets separately and launch on a separate PORT with synthetic data for a preview. CI runs checks on Ubuntu and Windows, with Python 3.11 and Node 24, without provider credentials. Before packaging, run npm ci and npm run build in each of sales/react, design/react, accounts/react, measurement/react, management/react and backend/react. CI verifies formatting, tests and strict TypeScript/Vite builds for these six frontends. The source archive is deterministic for identical source bytes; compare its SHA256 before rollout.

Existing Vercel tooling publishes an encrypted offline snapshot, NOT the Python APIs, durable storage or live Measurement. Its default target is now preview, and uploads require explicit `CRM_ALLOW_SNAPSHOT_DEPLOY=1`. Do not publish a current-data snapshot merely to test the foundation. Its legacy encrypted export and embedded data require a separate security/functional review. No preview or production cloud deployment was performed during this work.

Python's own documentation warns that http.server is not a production server: https://docs.python.org/3.11/library/http.server.html . Keep the current local runtime local. A real hosted release must select a supported application runtime behind TLS, persistent storage, identity/session controls, resource-level permissions and monitoring. The existing Vercel static host cannot supply these simply by copying the repository. This is a release blocker, not a functioning placeholder integration.

## Backups / restoration / rollback

1. Stop the sole CRM server and verify port 4300 is no longer listening. Prevent user edits.
2. Run `python -B scripts/backup.py --server-stopped --destination <private-backup-directory>`. Store encrypted off-device copies with access control and retention; backups contain personal data. The tool creates a new archive and never overwrites/restores files.
3. Before upgrades, preserve the source release, private configuration and a full data backup. Validate archive readability and periodically rehearse restoration in an isolated directory.
4. To restore: stop server, keep the current data directory as a dated recovery copy, extract a trusted backup into a separate directory, validate its store using `core.storage.validate`, compare client counts and attachments, then switch directories manually. Never overwrite the only copy.
5. For a bad latest write, inspect `data/store.previous.json` offline and compare with the full backup. Do not auto-restore: another legitimate edit may be newer.
6. For code rollback, extract the prior known-good source release separately and use a copied compatible data directory. Version 1 is additive; older code ignores its schemaVersion. Start on a test port, run health/navigation checks, then restart the primary instance. Avoid git reset/clean against the user's dirty checkout.

## Remaining hosted release gates

Identity and per-client authorization; durable transactional database and migration rehearsal; TLS/session expiry/logout/CSRF design; audited uploads/quotas/malware policy; provider idempotency for signature/email sends; central sanitized event/error logging, alerting and on-call ownership; backup retention and restore drills; licensed dependency inventory/vulnerability review; authenticated staging with synthetic accounts; complete department-level responsive/accessibility and E2E checks. Local admin/reader Basic authentication is not a substitute for these hosted controls.
