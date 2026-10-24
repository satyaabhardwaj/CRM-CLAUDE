# Deployment (Vercel + Supabase): readiness pack

Status (24 October 2026): **production cutover not performed.** The owner has authorized preview and production preparation in the go-live task. Only Vercel `magppie-crm-v2` and the named Supabase preview/production projects are authorized. Production cutover still requires the literal `START CUTOVER`. Current evidence and unresolved gates are recorded in [the execution log](history/GO_LIVE_2026-10-24.md).

- Current state and test evidence: [FINAL_DEPLOYMENT_CHECKLIST](FINAL_DEPLOYMENT_CHECKLIST.md).
- Every secret, with owner and rotation: [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md).
- Backup and restore commands: [OPERATIONS](OPERATIONS.md).

Release to deploy: **`v1.0-rc8`**, to be tagged on `main` at `7fa46cb` once the owner approves (sliding sessions, department roles, Users page, email sign-in codes, mail over HTTPS, nightly backup job). `v1.0-rc7` (`c2eebf1`) predates all of that.

## 1. Target

- **Vercel** serves the built React pages and the FastAPI API from one origin.
  - The entry point is `backend/server.py`.
  - `vercel.json` sets: framework `fastapi`, build `npm run build` (Node 24), Python 3.12, a 300 s function limit, and **Git auto-deploy off**.
  - The app never imports data or runs migrations at start or build.
- **Supabase** (region Mumbai, `ap-south-1`) provides PostgreSQL and one **private** Storage bucket.
  - Supabase Auth is not used. CRM passwords, sessions, MFA and roles live in CRM tables, and FastAPI checks them on every request.
  - All CRM tables have RLS on and no `anon`/`authenticated` access.
- **Database connections:**
  - The runtime connects through the **transaction pooler** (port 6543) as the least-privilege role `crm_app`, with NullPool and prepared statements off.
  - Migrations use a separate **direct/session** connection as the owner.
- **Files:** uploads and downloads use short-lived signed URLs, so file bytes never pass through Vercel.
- **Always off:** factory email returns 403, signatures are off, and Zoho is read-only.

## 2. Environments

| | Development (this laptop) | Preview | Production |
|---|---|---|---|
| Purpose | Daily local use, tests | Rehearsal on real hosting with synthetic data | Live use |
| Database | Local Supabase `postgres` | Supabase project `magppie-crm-preview` | Supabase project `magppie-crm-prod` |
| Bucket | `crm-uploads` (local) | `crm-uploads` (preview project) | `crm-uploads` (prod project) |
| Data | Live local data | Synthetic only, unless a copy is approved | Approved business data, imported once at cutover |
| Users | Local admin | Fresh test identities | Fresh named identities |
| Realm UUID, MFA key, credentials | Local only | Unique to preview | Unique to production |

Nothing is copied between environments: no credentials, sessions, MFA enrolments or realm values.

## 3. Environment variables (names only)

Set in Vercel under Project → Settings → Environment Variables, scoped to Preview or Production. "Operator" means it is set only in the operator's terminal for one command, never in Vercel.

| Name | Preview | Production | Notes |
|---|---|---|---|
| `CRM_ENV` | `preview` | `production` | Turns on hosted checks (fail closed). |
| `CRM_ORIGIN` | exact preview HTTPS origin | exact production HTTPS origin | Cookie/origin checks; must be `https://`. |
| `CRM_AUTH_REALM` | new UUID | different new UUID | Never reuse or change after provisioning. |
| `CRM_MFA_ENCRYPTION_KEY` | new key | different new key | Required (admins must use MFA). Back up separately; never regenerate. |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | absent | optional | Mail over HTTPS through the Gmail API (scope `gmail.send`), preferred over SMTP. Set from a separate OAuth client per environment. |
| `CRM_EMAIL_OTP` | `1` if the preview admin's mailbox is verified | `1` once `info@mymagppie.com` is verified as recovery mailbox | Sign-in code by email; needs the CRM mail settings (Gmail API preferred, or SMTP). In preview and production admins still need an authenticator app as well (see decision D6). |
| `CRM_SESSION_IDLE_MINUTES` | `240` | `240` | Optional; idle sign-out (default 240). Not a secret. |
| `CRM_SESSION_MAX_HOURS` | `12` | `12` | Optional; absolute session limit (default 12). Not a secret. |
| `CRM_LOCAL_ADMIN`, `CRM_LOCAL_ADMIN_PASSWORD` | absent | absent | Laptop-only first-run admin; ignored in preview and production. Never set in Vercel. |
| `DATABASE_URL` | `crm_app` via pooler | `crm_app` via pooler | Runtime role from `backend.runtime_role`. |
| `CRM_STORAGE_BACKEND` | `supabase` | `supabase` | Vercel refuses anything else. |
| `SUPABASE_URL` | preview project URL | prod project URL | Public endpoint; used for signed URLs. |
| `SUPABASE_SERVICE_ROLE_KEY` | preview key | prod key | Server only. |
| `SUPABASE_UPLOADS_BUCKET` | `crm-uploads` | `crm-uploads` | Must be private. |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` | optional (mock or read-only) | required for Measurement | Read-only scopes only. |
| `ZOHO_ACCOUNTS_URL`, `ZOHO_API_DOMAIN`, `ZOHO_ORG_ID` | as above | as above | India data centre defaults. |
| `CRM_RECOVERY_ENABLED` | `1` | `1` | Reset links by email; needs the CRM mail settings. |
| `RECOVERY_MAIL_FROM` | `info@mymagppie.com` | `info@mymagppie.com` | Sender of reset links and sign-in codes. |
| `RECOVERY_SMTP_HOST`, `RECOVERY_SMTP_PORT`, `RECOVERY_SMTP_USER`, `RECOVERY_SMTP_PASSWORD` | absent | absent (Gmail API is used) | Only if SMTP is chosen instead of the Gmail API; Vercel may block outbound SMTP. Separate from any factory mail. |
| `GROQ_API_KEY` / `OPENAI_API_KEY` | absent | optional (voice notes) | Groq wins when both are set. |
| `MIGRATION_DATABASE_URL` | **operator only** | **operator only** | Owner/direct connection for migrations and `runtime_role`. Never set in Vercel. |

Never set in a hosted environment:
- the mail and signature variables (`SMTP_*`, `MAIL_FROM`, `FACTORY_EMAIL`, `MAIL_TEST_EMAIL`, `ZOHO_SIGN_*`, `SIGN_*`);
- `SUPABASE_INTERNAL_URL`, `CRM_UPLOADS_DIR`, `MEASUREMENT_ENV_FILE`;
- the retired 4300 settings (`CRM_ADMIN_PASSWORD`, `CRM_READER_PASSWORD`, `READ_ONLY`, `HOME_PAGE`);
- anything with a `VITE_` prefix.

`VERCEL` is set by the platform.

## 4. Migration order (each environment, operator terminal, `MIGRATION_DATABASE_URL` exported)

1. **Storage policy:** apply `supabase/migrations/202610190001_private_uploads.sql`. It creates the private `crm-uploads` bucket and its policies.
2. **Schema:** `alembic upgrade head` (0001 initial → 0002 local login → 0003 auth-attempt index → 0004 auth realms → 0005 password recovery → 0006 MFA → 0007 sliding sessions → 0008 department roles → 0009 user administration → 0010 sign-in codes by email). 0007–0010 are additive (new columns and a wider role check); existing users keep their role.
3. **Runtime role:** `backend.runtime_role` (section 5). Re-run it after every future migration.
4. **Check:**
   - `alembic current` shows `0012`;
   - every CRM table has RLS on, with no `anon`/`authenticated` grants;
   - the bucket is private (an unsigned URL is refused).

Migrations never run on app start or during a Vercel build.

## 5. Runtime role (least privilege)

```powershell
# operator terminal; MIGRATION_DATABASE_URL (owner, direct) exported for this process only
.venv\Scripts\python.exe -m backend.runtime_role --role crm_app --confirm-target "HOST/DATABASE"
```

- **Password:** typed at a hidden prompt, at least 24 characters. Only a SCRAM verifier reaches the server.
- **What the role gets:** read/write on the CRM tables plus a `crm_runtime` RLS policy. It has no DDL, no BYPASSRLS and no Supabase API roles, and the command prints PASS/FAIL for each check.
- **Connection:** put the role in `DATABASE_URL` through the transaction pooler as user `crm_app.<project-ref>`.
- **The owner credential** stays with the operator for migrations only.

## 6. Step list

**Gate B: preview (authorized in the 24 October master task; synthetic data only)**
1. **Owner, accounts:** the Vercel team (Pro), and Supabase org and projects `magppie-crm-preview` and `magppie-crm-prod` in Mumbai.
   - Use only Vercel `magppie-crm-v2`. The old `magppie-crm` and all unrelated projects stay untouched.
2. **Vercel project:** import the GitHub repo with Git auto-deploy off (as in `vercel.json`) and set the preview variables (section 3).
3. **Database:** migrate the preview project (section 4) and create `crm_app` (section 5).
4. **Users:** with the exported preview configuration, `python -m backend.users add EMAIL --role ROLE --confirm-target "HOST/DATABASE"` for one admin (who enrols the authenticator at first sign-in) and one user per department role (sales, design, measurement, accounts, reader); each gets a one-time temporary password and must choose their own at first sign-in. Then `backend.recovery_email --email EMAIL --confirm-target "HOST/DATABASE" --ownership-verified` for the admin's mailbox, so reset links and sign-in codes go there.
5. **Data:** synthetic only. Real data is forbidden in preview.
6. **Deploy** the exact tested `release/go-live` commit to preview after its CI is green and Preview secrets are isolated from Production. Record the commit and deployment URL.
7. **Verify on the preview URL:**
   - sign-in, the emailed sign-in code, MFA, sign-out, and old cookies rejected;
   - idle sign-out after `CRM_SESSION_IDLE_MINUTES` with the "Stay signed in" warning (preview may shorten it to 5 minutes for this check), and unsaved work kept across sign-in;
   - the Users page: add, role change, deactivate, reset password (forced change at next sign-in);
   - reset link email arrives (Gmail API from Vercel);
   - each role's allowed and denied actions, CRUD and Bin restore;
   - private upload/download, with an unsigned URL refused;
   - money calculations and factory mail 403;
   - Zoho sync time and cold start within 300 s;
   - phones (UI_GUIDE checklist);
   - a secret scan of the deployed assets.

**Gate C: production (requires "START CUTOVER" and all preview/readiness gates passed)**
8. Production variables, migration, runtime role and fresh identities, as for preview.
9. The cutover runbook (section 7).
10. Backups and monitoring switched on (sections 8–9) before users are told.

## 7. Cutover runbook (with rollback)

Before the window:
- Rehearse the whole runbook once on preview with a copy of synthetic data.
- Confirm the window, the people and the rollback owner.

1. **Freeze (only after START CUTOVER):** announce the window and stop every CRM writer. The currently verified Docker app is `magppie-crm-container-crm-1` on 4302; stop that app container without removing it or its volumes. `Stop CRM.cmd` handles the native launcher and local Supabase; it does not stop the Docker app container. Verify both app ports 4301/4302 are unavailable and all staff have closed the app. Since `Stop CRM.cmd` also stops the database/Storage, run `npm run db:start` to start only the database/Storage services before backup. Keep every CRM app process stopped; do not run `Start CRM.cmd`. If the native stop script refuses an unrelated listener, investigate its ownership instead of killing it.
2. **Final backup:** take the local backup and check it can be restored:

   ```powershell
   .venv\Scripts\python.exe scripts\backup_postgres.py --output .local\backups\cutover-YYYYMMDD --writes-paused --restore-check
   ```

   Record the manifest fingerprints and attachment hashes.
3. **Import:** use `scripts/restore_postgres.py --business-only --backup <verified-folder> --bucket crm-uploads --confirm-target <host/database> --confirm-storage-origin <https-project-origin>`. Privately inject `RESTORE_DATABASE_URL`, `RESTORE_SUPABASE_URL`, and `RESTORE_SUPABASE_SERVICE_ROLE_KEY`. This path requires a restore-verified backup, a migrated destination with every CRM table empty, and an existing empty private bucket. It imports only `crm_state`, `crm_clients`, and attachments. Never use the full-database restore path for production identity separation. An interrupted upload leaves destination objects for inspection; do not overwrite or retry blindly.
   - Do **not** carry over development users, credentials, sessions, MFA, grants or realm bindings; apply the destination-only identity plan in PRODUCTION_SECRETS.
4. **Reconcile:** row fingerprints and attachment hashes must equal the manifest. **Any mismatch: stop and roll back** (step R).
5. **Identities:** provision named users. Admins sign in, enrol MFA and save their recovery codes.
6. **Deploy and smoke:** deploy the exact tested release commit to production, then check health, sign-in, each module, one attachment, the counts from the final frozen backup manifest (never hard-code the earlier audit counts), factory mail 403 and Measurement.
7. **Open:** tell users the new URL. Keep the local copy read-only for 14 days.

**Rollback (R):** done before any production write by users. Nothing local has been changed, so it is reversible.
- Before any production user writes, resume the verified local runtime recorded at freeze (the existing Docker app on 4302 or the native launcher if it was verified). Reconcile the launcher retirement marker if already activated through an explicitly approved rollback; do not silently bypass it.
- Leave the production project as it is for diagnosis.
- Never restore over production. A second attempt goes into a new database.

After users have written to production, rollback means:
- promote the previous Vercel deployment (app only);
- restore the database into a new target only, then reconcile newer writes before an approved switch.

Never roll back to a build that bypasses hosted identity or MFA.

## 8. Backup schedule (production)

| What | When | Kept | Where |
|---|---|---|---|
| Supabase automated daily backups (Pro) | daily | per plan (7 days on Pro) | Supabase |
| Point-in-time recovery (add-on, recommended) | continuous | 7 days | Supabase |
| Logical dump + attachment set (`backup_postgres.py` pattern against prod, read-only operator role) | weekly, plus before every migration and release | 12 weekly, 12 monthly | encrypted, off Supabase (owner-controlled storage) |
| Restore rehearsal into a new database and bucket (`restore_postgres.py`) | monthly | evidence kept 12 months | separate project/database |
| `CRM_MFA_ENCRYPTION_KEY`, realm UUID | when created and when rotated | permanent | password manager, separate from the dumps |

Alert email is `info@mymagppie.com`. PITR remains an owner decision; do not claim it is enabled without verification.

## 9. Monitoring and alerts

| Signal | Source | Alert when | To |
|---|---|---|---|
| App up | Uptime check on `GET /api/health` (it queries the database) every 1–5 min | 2 failures in a row | alert email + owner phone |
| Errors | Vercel function logs / error rate (5xx) | > 2% of requests over 10 min, or any 500 on `/api/store` | alert email |
| Slow syncs | Vercel function duration for `/api/measurement/requests` | > 200 s (limit 300 s) | alert email |
| Sign-in abuse | `crm_audit` `auth.attempt` count; 429 responses | > 50 failed sign-ins per hour | owner |
| Database | Supabase CPU, connections, disk | > 80% for 15 min; disk > 75% | alert email |
| Storage | Supabase bucket size and egress | > 75% of plan | alert email |
| Backups | daily backup present; weekly dump job result | missing or failed | owner |
| Security drift | weekly check: RLS on, bucket private, no `anon` grants, factory mail 403 | any change | owner |

Logs keep no request bodies or query strings (already the case). Set log retention to at least 30 days.

## 10. Decisions (owner)

Accounts found on 23 Oct 2026 (read only): Supabase organisation "Magppie1234's Org" on **Pro** with three unrelated projects in Mumbai (`clarity-desk-prod`, `magppie-factory`, `Kitchen_Designer`), none for this CRM; Vercel team "Magppie Silverstone Pvt Ltd" with a historical project **`magppie-crm`** (an earlier build) and `magppie-crm-clone`. Nothing was created or changed.

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| D1 | Go-ahead for preview (creates cloud resources and cost) | Yes, preview first | Gate B |
| D2 | Supabase projects: new `magppie-crm-preview` and `magppie-crm-prod` in the existing Pro org, Mumbai | Yes; each project adds compute cost (about $10/month on the smallest size) | Gate B |
| D3 | Vercel project: a new project (for example `magppie-crm-v2`) or reuse the historical `magppie-crm` | New project; leave `magppie-crm` untouched until retired | Gate B |
| D4 | Address: `*.vercel.app` for preview; production on `crm.mymagppie.com` (needs DNS access for `mymagppie.com`) | Yes; tell us who manages DNS | Gate B / C |
| D5 | Preview data: synthetic only, or a copy of real data | Synthetic only | Gate B |
| D6 | Admin second step in the cloud: authenticator app required (current rule) plus the emailed code, or the emailed code alone | Keep the authenticator for admins | Gate B |
| D7 | Mail from the cloud: a separate Gmail API OAuth client for Vercel (same mailbox `info@mymagppie.com`) | Yes; created the same way as the laptop's | Gate B |
| D8 | Who signs in on preview (emails and roles) | The owner as admin plus one test person per role | Gate B |
| D9 | Release tag `v1.0-rc8` on `main` | Yes | Gate B |
| D10 | Production admins (at least two, each with an authenticator) | Owner plus one trusted person | Gate C |
| D11 | Staff list for production: email and role of each person | From the current team | Gate C |
| D12 | Cutover window (about one hour, local CRM closed), freeze notice and rollback owner | An evening or weekend | Gate C |
| D13 | Backups and alerts: Point-in-time recovery add-on, alert email address | PITR on for production; alerts to `info@mymagppie.com` | Gate C |
| D14 | Business rules awaiting Manish (CLAUDE.md "To confirm") | Decide or accept as is | before go-live |

## 11. Not deployment

The multi-stage `Dockerfile` and `docker-compose.yml` are local verification only ([deploy/README.md](../deploy/README.md)); Vercel builds from source.
