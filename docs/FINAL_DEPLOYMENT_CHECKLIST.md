# Deployment readiness (updated 22 October 2026)

Local verification only; no cloud deployment is authorized. The target is Vercel (React assets + FastAPI) with Supabase (PostgreSQL + private Storage). Vercel builds from source; the Docker image is local verification evidence, not its deployment artifact. The plan is in [DEPLOYMENT](DEPLOYMENT.md).

## Current state

| Item | State |
|---|---|
| Release candidate | `v1.0-rc3` (7305e0f) on `main`. Branch `ui/polish-v1` adds the UI polish (design system, shared shell, components, smooth refresh); `v1.0-rc5` follows its Gate 3 approval and merge. |
| Live data | Local DB `postgres` and bucket `crm-uploads`: 28 clients, 15 public tables, 15 attachments. Unchanged by the UI polish. `crm_audit` and `crm_sessions` change by design; `crm_mfa` changed on 22 Oct when the owner signed in and opened Account security (authenticator not yet enabled). |
| Backups | `.local/backups/phase0-20261021-2322` and `.local/backups/phase3-20261021-2347` (restore verified). Older backups and evidence are in the encrypted archive (see [OPERATIONS](OPERATIONS.md)). |
| Restore | One command, `scripts/restore_postgres.py`, into a new database only. The 21 Oct duplicate-schema failure is fixed. Rehearsed on 21 Oct: tables, clients and all 15 attachment bytes matched, with RLS on and no public grants. The rehearsal databases and bucket were dropped. |
| QA leftovers | All QA and restore databases, the 85 stray `test_*` schemas in the live database and the QA bucket were removed (Gate A). `test_api.py` now refuses non-test databases. |
| Legacy code | Archived on branch `archive/legacy-2026-10` and removed from `main`. |
| Backend tests | See the rc3 regression below. |

### UI polish regression (22 Oct, branch ui/polish-v1)

All checks used synthetic data on loopback QA servers. Throwaway QA databases were dropped afterwards.

| Check | Result |
|---|---|
| Six frontends: format check, tests, build | All pass. 218 tests (auth 42, sales 46, design 47, accounts 26, measurement 18, management 39). |
| Backend on an isolated PostgreSQL database (throwaway `crm_crud_test_qa_*`, dropped) | 119 passed, 1 skipped. The skip is the real-Storage test: on this laptop it would write to and delete from the live bucket, and no storage code changed since rc3. Includes the 28 CRUD, role and MFA-policy tests. |
| `scripts/check.py` | Pass |
| Layout audit, Chromium: 1,100 states, 10 widths (320 to 1920, plus landscape); data states 0, 1, loading and error; 76 background-refresh checks | 0 page overflow, overlaps, clipped text or squeezed lists. Touch targets ≥ 44 px except the 30 px map pins. Worst CLS (load and refresh) 0.032. No focus or scroll lost on refresh. |
| Firefox and WebKit (868 states each, 10 widths); zoom 200%, Windows 125%/150% and a 1366 laptop at 125% (344 states) | 0 page overflow, overlaps or clipping in every engine and scale. The only finding is the 30 px map pins. Worst CLS 0.021 at the scaled sizes. One Firefox finding (Accounts tabs moving when counts loaded) was fixed and rechecked. |
| Keyboard and screen reader (`npm run ui:a11y`) | 0 unnamed controls on 14 page × width checks. Focus is visible and in screen order, never on hidden elements. Escape closes the drawer, bell and user menu, and focus returns. |
| Visual baselines (`npm run ui:visual`) | 12 baselines (5 modules + sign-in at 390 and 1440), stable across runs |
| Docker `magppie-crm:rc5-candidate` | Healthy on 127.0.0.1:4302: read-only root, all capabilities dropped, no-new-privileges, non-root, loopback only. Signed out: modules redirect to sign-in, data API 401, private paths not served. |
| Factory mail | 403 for an admin request (QA server) |
| Browser storage after sign-in | Only `crm.ui.density`. The session cookie is HttpOnly and SameSite=Strict. |
| Secret scan (built assets, `shared/`, image `/app`) | 0 real hits. No env, key or data files in the image. |
| Cold start after a reboot (Docker Desktop quit) | `Start CRM.cmd`: 98 s, no manual steps |

### Full regression for v1.0-rc3 (22 Oct, code 7305e0f)

Image: `magppie-crm:rc3-7305e0f` (sha256:2b3a3d24ceef…). All checks ran on synthetic data, with new QA databases and buckets that were dropped afterwards.

| Check | Result |
|---|---|
| Six frontends: format check, tests, build | All pass; 212 tests (auth 38, sales 46, design 47, accounts 26, measurement 18, management 37) |
| Backend + foundation on isolated PostgreSQL, including the real Storage test on a new private QA bucket | 124 passed, 0 skipped |
| `scripts/check.py` | Pass |
| CRUD and role suite (admin, reader, assigned read/write, logged out) plus the MFA policy | 28 passed |
| Docker multi-stage build; compose on 127.0.0.1:4316 (separate QA project, same hardening) | Healthy; read-only root fs, all capabilities dropped, no-new-privileges, uid 10001, loopback-only port |
| Container security smoke, four roles | 121 of 121 checks passed: admin MFA policy, MFA, recovery, revocation, factory mail 403, signatures off, private signed upload/download, tampered/unsigned/public URL denied |
| Viewport matrix: 10 screens (five modules, security, login, MFA challenge, forgot, reset) at 320/390/768/1440 | 40 views, no horizontal document overflow |
| Browser storage after sign-in | Only `crm.ui.density` in localStorage; session cookie not readable by JavaScript |
| Secret scan | 24 known secret values (compared in memory) and patterns: 0 hits in the 15 built asset files, in the image assets, or in the image app files (the only matches were public Zoho endpoint defaults); no env, key or data files in the image |
| Live data | Unchanged: 28 clients, 15 tables, 15 attachments |

Evidence (private): `.local/rc3-regression-20261022/`. Not covered:
- GitHub CI status (check the Actions tab);
- physical phones and other browsers;
- real SMTP;
- a hosted Supabase project;
- real Zoho (mocked).
The running 4302 container still uses the older image.

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
