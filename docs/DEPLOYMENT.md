# Deployment (Vercel + Supabase): readiness pack

Status: **not deployed.** Nothing in this document has been done in the cloud. Creating projects, setting secrets, migrating, importing data or deploying happens only in a separate task you approve explicitly: Gate B "DEPLOY PREVIEW", then Gate C "GO LIVE".

- Current state and test evidence: [FINAL_DEPLOYMENT_CHECKLIST](FINAL_DEPLOYMENT_CHECKLIST.md).
- Every secret, with owner and rotation: [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md).
- Backup and restore commands: [OPERATIONS](OPERATIONS.md).

Release to deploy: tag **`v1.0-rc6`** (`6e42372`).

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
| `CRM_EMAIL_OTP` | `0` | `0` until the recovery mailbox is verified, then `1` if wanted | Sign-in code by email; needs the `RECOVERY_SMTP_*` settings. Admins still need an authenticator here. |
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
| `CRM_RECOVERY_ENABLED` | `0` | `0` until recovery mail is verified, then `1` | |
| `RECOVERY_SMTP_HOST`, `RECOVERY_SMTP_PORT`, `RECOVERY_SMTP_USER`, `RECOVERY_SMTP_PASSWORD`, `RECOVERY_MAIL_FROM` | absent | set only when recovery is enabled | Separate from any factory mail. |
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
   - `alembic current` shows `0010`;
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

**Gate B: preview (needs "DEPLOY PREVIEW")**
1. **Owner, accounts:** the Vercel team (Pro), and Supabase org and projects `magppie-crm-preview` and `magppie-crm-prod` in Mumbai.
   - Recheck the historical Vercel project `magppie-crm` before any change; unrelated projects stay untouched.
2. **Vercel project:** import the GitHub repo with Git auto-deploy off (as in `vercel.json`) and set the preview variables (section 3).
3. **Database:** migrate the preview project (section 4) and create `crm_app` (section 5).
4. **Users:** provision preview identities with `backend.provision_user --confirm-target "HOST/DATABASE"`: one admin (who enrols MFA at first sign-in), one reader and one assigned.
5. **Data:** load synthetic data only, unless you approve a copy.
6. **Deploy** tag `v1.0-rc6` to preview.
7. **Verify on the preview URL:**
   - sign-in, MFA, sign-out, and old cookies rejected;
   - each role's allowed and denied actions, CRUD and Bin restore;
   - private upload/download, with an unsigned URL refused;
   - money calculations and factory mail 403;
   - Zoho sync time and cold start within 300 s;
   - phones (UI_GUIDE checklist);
   - a secret scan of the deployed assets.

**Gate C: production (needs "GO LIVE")**
8. Production variables, migration, runtime role and fresh identities, as for preview.
9. The cutover runbook (section 7).
10. Backups and monitoring switched on (sections 8–9) before users are told.

## 7. Cutover runbook (with rollback)

Before the window:
- Rehearse the whole runbook once on preview with a copy of synthetic data.
- Confirm the window, the people and the rollback owner.

1. **Freeze:** announce the window and stop writes locally (close the CRM on every machine, then `Stop CRM.cmd`).
2. **Final backup:** take the local backup and check it can be restored:

   ```powershell
   .venv\Scripts\python.exe scripts\backup_postgres.py --output .local\backups\cutover-YYYYMMDD --writes-paused --restore-check
   ```

   Record the manifest fingerprints and attachment hashes.
3. **Import:** load only the approved business data (`crm_state`, `crm_clients`) and the attachments into production, using `scripts/restore_postgres.py` into the empty prod database (`RESTORE_DATABASE_URL`) and `--bucket`.
   - Do **not** carry over development users, credentials, sessions, MFA, grants or realm bindings; apply the destination-only identity plan in PRODUCTION_SECRETS.
4. **Reconcile:** row fingerprints and attachment hashes must equal the manifest. **Any mismatch: stop and roll back** (step R).
5. **Identities:** provision named users. Admins sign in, enrol MFA and save their recovery codes.
6. **Deploy and smoke:** deploy `v1.0-rc6` to production, then check health, sign-in, each module, one attachment, the counts (28 clients, 44 architects, 15 attachments today), factory mail 403 and Measurement.
7. **Open:** tell users the new URL. Keep the local copy read-only for 14 days.

**Rollback (R):** done before any production write by users. Nothing local has been changed, so it is reversible.
- Point users back to the local CRM (`Start CRM.cmd`).
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

Retention and the alert email are open decisions (section 10).

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

## 10. Decisions still open

| Decision | Needed by |
|---|---|
| Domain and DNS access (or an initial `*.vercel.app` URL) | Gate B (origin) |
| Vercel team and plan (Pro) and who owns billing | Gate B |
| Supabase organisation and plan (Pro, Mumbai), project names | Gate B |
| Production admin (name and email) and who holds the second admin | Gate C |
| Users and roles file: who is admin, reader or assigned, and which clients each assigned user may see or write | Gate C |
| Recovery email: SMTP provider, sender address and verified mailboxes; until then `CRM_RECOVERY_ENABLED=0` | before enabling recovery |
| Backup retention (proposed: 12 weekly + 12 monthly) and the alert email address | Gate C |
| Cutover window, freeze notice and rollback owner | Gate C |
| Preview data: synthetic only, or an approved anonymised copy | Gate B |
| Business rules awaiting Manish (CLAUDE.md "To confirm"): post-design order defaults; PI booking line; "On hold" orders; Order type; retry timer; timeline offsets; GST on the designer's estimate; payment plan approver; OCF generator; re-approval after changes; "Express" timeline; restoring disqualified leads; Management client-wise scope; real post-design stages from Zoho; Accounts stage money order; Accounts gates; Measurement request types | before go-live, or accepted as is |

## 11. Not deployment

The multi-stage `Dockerfile` and `docker-compose.yml` are local verification only ([deploy/README.md](../deploy/README.md)); Vercel builds from source.
