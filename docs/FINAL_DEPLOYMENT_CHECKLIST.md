# Deployment readiness (updated 22 October 2026)

Local verification only; no cloud deployment is authorized. The target is Vercel (React assets + FastAPI) with Supabase (PostgreSQL + private Storage). Vercel builds from source; the Docker image is local verification evidence, not its deployment artifact. The plan is in [DEPLOYMENT](DEPLOYMENT.md).

## Current state

| Item | State |
|---|---|
| Release candidate | `v1.0-rc2` (7469f56). Phases 2â€“4 of the master task follow it on `main`; `v1.0-rc3` comes after the Phase 6 regression. |
| Live data | Local DB `postgres` and bucket `crm-uploads`: 28 clients, 15 public tables, 15 attachments. The fingerprint has been unchanged since the 21 Oct baseline (`crm_audit` and `crm_sessions` change by design). |
| Backups | `.local/backups/phase0-20261021-2322` and `.local/backups/phase3-20261021-2347` (restore verified), plus `.local/final-docker-regression-20261021/backup`. Older backups are in the encrypted archive (see [OPERATIONS](OPERATIONS.md)). |
| Restore | One command, `scripts/restore_postgres.py`, into a new database only. The 21 Oct duplicate-schema failure is fixed. Rehearsed on 21 Oct: tables, clients and all 15 attachment bytes matched, with RLS on and no public grants. The rehearsal databases and bucket were dropped. |
| QA leftovers | All QA and restore databases, the 85 stray `test_*` schemas in the live database and the QA bucket were removed (Gate A). `test_api.py` now refuses non-test databases. |
| Legacy code | Archived on branch `archive/legacy-2026-10` and removed from `main`. |
| Backend tests | 110 passed and 1 optional Storage test skipped, on isolated PostgreSQL (21 Oct, Phase 3). |

### Last full regression (21 Oct, code 0a2f907; to be repeated in Phase 6)

Image: `magppie-crm:quiet-graphite-0a2f907`.

| Check | Result |
|---|---|
| Six frontend test suites | 209 passed |
| Backend on isolated PostgreSQL | 102 passed, 1 optional Storage test skipped |
| Same-image Docker security smoke | 90 passed |
| Five modules at 320/390/768/1440 px | 20 views; no document horizontal overflow |
| Login, MFA, recovery, logout | Passed, with recovery mail mocked |
| Private Storage | 5 MiB signed upload/download passed; public, unsigned and tampered URLs denied |

The evidence is in `.local/final-docker-regression-20261021/` and `.local/master-20261021/`, both private.

## Current auth and integration status

- Local migrations through 0006 and persistent MFA encryption key were activated in the earlier authorized task. No user enrollment/password/role changes occurred in this readiness task.
- Hosted auth requires a unique environment realm and account/session bindings; copied development credentials/cookies are not valid hosted identities.
- Recovery and MFA are implemented. Recovery delivery remains disabled until separate SMTP setup and mailbox ownership enrollment are authorized. MFA is required for admins (enforced server-side; fail closed on hosted environments without a key) and optional for reader/assigned. The lost-factor procedure uses `backend.reset_mfa` (owner Satya Bhardwaj).
- Factory email remains blocked (403 in latest regression); signatures remain off. No outbound email, signature or Zoho writes in these checks.
- Latest regression mocked Zoho reads; earlier real local Measurement sync evidence is historical, not proof of hosted cold-start/runtime behavior.

## User setup before cloud release

- [ ] Approve Vercel/Supabase account/team, project names, region and budget.
- [ ] Choose domain and DNS access, or an initial provider domain.
- [ ] Choose separate preview and production databases/buckets/credentials.
- [ ] Choose admin identity, fresh password and teammate roles/grants. (MFA policy decided 22 Oct: required for admins.)
- [ ] Privately configure server-only database/Storage/Zoho secrets, exact HTTPS origin, unique auth realm and persistent MFA encryption key. Migration credentials stay separate from app runtime/build.
- [ ] Configure recovery-only SMTP and verify mailbox ownership before enabling delivery; keep factory mail disabled.
- [ ] Approve data scope, cutover window, backup retention/recovery objectives, monitoring owner and alerts.
- [ ] Explicitly authorize cloud setup/deployment later. Historical Vercel project linkage/deletion status must be rechecked before any change; unrelated projects stay untouched.

## Engineering gates after authorization

- [ ] Verify actual hosted framework routing, runtime/build compatibility, time/body limits, Zoho cold starts and multi-instance concurrency.
- [ ] Apply reviewed Alembic and Storage migrations with separate migration credentials; do not run migrations at app startup/build.
- [ ] Configure least-privilege runtime grants/RLS, private bucket policies, TLS and HTTPS cookie/origin behavior.
- [ ] Take a fresh coordinated cutover backup; import only approved business data/attachments into a verified destination and reconcile hashes. Provision fresh production identities/grants; do not import development sessions or enrollments.
- [ ] Verify hosted login/logout, MFA/recovery delivery, role denials, private signed files, calculations and factory-mail 403 on preview before production.
- [ ] Schedule database AND attachment backups, protect the MFA key separately, and rehearse hosted recovery into a separate destination.
- [ ] Verify physical mobile devices/additional browsers as required. Local UI evidence uses Chromium viewport emulation.
- [ ] If distributing Docker, scan OS layers; local tests do not establish vulnerability-free production readiness.

## Rollback and safety

Keep a compatible previous app release and additive database schema. Never roll back to a backend that bypasses hosted identity/MFA. Restore databases into a separate target, verify hashes and reconcile new writes before an explicitly approved connection switch; never overwrite live data automatically.

Never run `supabase db reset`, `stop --no-backup`, `docker compose down --volumes` or `docker volume prune` on the data-bearing environment. Approved cleanup (Gate A, 21 Oct) removed only QA databases, QA schemas, a QA bucket and archived local files; no live table, object or configuration changed.

See [SETUP](SETUP.md), [DEPLOYMENT](DEPLOYMENT.md), [OPERATIONS](OPERATIONS.md), [SECURITY](SECURITY.md), [production secrets](PRODUCTION_SECRETS.md) and the [container runbook](../deploy/README.md).
