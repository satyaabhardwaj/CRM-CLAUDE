# Deployment readiness — 21 October 2026

Local verification only. No cloud deployment is authorized. Target: Vercel React assets + FastAPI, Supabase PostgreSQL + private Storage. Vercel builds source; the Docker image is local verification evidence, not its deployment artifact.

## Current verified baseline

Code: `0a2f907`; image `magppie-crm:quiet-graphite-0a2f907`, digest `sha256:6f0075a9d0e3f9ebbf3604572e6c5b62aa8b81ce40faa542c742f0eb16371dde`. This supersedes image/test totals in earlier UI reports. Docker CRM uses loopback 4302; native 4301 is separate.

| Check | Latest result | Evidence |
|---|---|---|
| Six frontend test suites | 209 passed | `.local/final-docker-regression-20261021/*-react-tests.log` |
| Backend on isolated PostgreSQL | 102 passed, 1 optional Storage test skipped | `backend-tests.log` in that directory |
| Same-image Docker security smoke | 90 passed | `container-security.json` |
| Five modules, 320/390/768/1440px | 20 views; no document horizontal overflow | `screenshots/viewport-matrix.json` |
| Login/MFA/recovery/logout | QA regression passed; recovery mail mocked | regression `REPORT.md` |
| Restore rehearsal | 15 public tables and 28 clients match backup fingerprints | readiness evidence below |
| Restored attachments | All 15 byte hashes match backup | readiness evidence below |
| Private Storage | 5 MiB signed upload/download, authenticated read, public/unsigned/tampered URL denial passed | readiness evidence below |
| Live preservation | All public-table fingerprints and all 15 attachment hashes unchanged during rehearsal | readiness evidence below |

Latest regression: `.local/final-docker-regression-20261021/REPORT.md`.
Backup used: `.local/final-docker-regression-20261021/backup/` (dump, manifest, attachment bytes). Its original manifest records `restore_verified: false` because restoration was not performed when the backup was taken. The subsequent rehearsal evidence is separate; the original backup was not rewritten.

Restore/Storage evidence: `.local/readiness-restore-storage-20261021/results-crm_restore_qa_7905c529d6744903b96d10916bae2035.json`.

Restored database: `crm_restore_qa_7905c529d6744903b96d10916bae2035`.
Private QA bucket: `crm-qa-d1e1e3cae22c4ed08c91f67d8c7396bf`.
These are isolated database/bucket namespaces on the existing loopback-only local services, not a second Supabase installation. No app was pointed at restored identities/sessions. Restored private data remains sensitive and is retained locally; cleanup requires approval.

The first rehearsal attempt failed at duplicate default public-schema creation. The successful retry used another fresh database and a restore list excluding only that schema creation; all table/data/index/constraint entries were restored without dropping existing schemas. The failed QA database is retained too. No application or backup-script fix was applied.

The original optional pytest Storage test remains recorded as skipped. This follow-up used the real Storage API and application Attachments implementation against a new private QA bucket without its deletion cleanup. It does not retroactively change the earlier suite counts.

## Current auth and integration status

- Local migrations through 0006 and persistent MFA encryption key were activated in the earlier authorized task. No user enrollment/password/role changes occurred in this readiness task.
- Hosted auth requires a unique environment realm and account/session bindings; copied development credentials/cookies are not valid hosted identities.
- Recovery and MFA are implemented. Recovery delivery remains disabled until separate SMTP setup and mailbox ownership enrollment are authorized. MFA enrollment is opt-in; mandatory policy and lost-factor operator procedure remain decisions.
- Factory email remains blocked (403 in latest regression); signatures remain off. No outbound email, signature or Zoho writes in these checks.
- Latest regression mocked Zoho reads; earlier real local Measurement sync evidence is historical, not proof of hosted cold-start/runtime behavior.

## User setup before cloud release

- [ ] Approve Vercel/Supabase account/team, project names, region and budget.
- [ ] Choose domain and DNS access, or an initial provider domain.
- [ ] Choose separate preview and production databases/buckets/credentials.
- [ ] Choose admin identity, fresh password, teammate roles/grants and MFA policy.
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

Never run `supabase db reset`, `stop --no-backup`, `docker compose down --volumes` or `docker volume prune` on the data-bearing environment. No files, buckets, objects or databases were deleted in this follow-up. No cloud settings or live application configuration changed.

See [Vercel/Supabase runbook](VERCEL_SUPABASE.md), [production secrets](PRODUCTION_SECRETS.md), [auth realms](AUTH_REALMS.md), [recovery](ACCOUNT_RECOVERY.md), [MFA](MFA.md), and [container runbook](../deploy/README.md).
