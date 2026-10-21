# Deployment (Vercel + Supabase)

Status: **not deployed.** No cloud project, deployment or data upload is authorized until it is explicitly approved at Gate B ("DEPLOY PREVIEW") and Gate C ("GO LIVE"). Use [FINAL_DEPLOYMENT_CHECKLIST](FINAL_DEPLOYMENT_CHECKLIST.md) for the current readiness state and [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md) for every variable.

## Target

- **Vercel** serves the built React pages and the FastAPI API at one origin.
  - The entry point is `backend/server.py`. It never imports data or runs migrations at startup.
  - In `vercel.json`: framework `fastapi`, build `npm run build`, Git auto-deploy **disabled**, and a 300 s function limit.
  - `.vercelignore` excludes private data, env files, the Docker files and old snapshot tooling.
- **Supabase** provides PostgreSQL and one private Storage bucket.
  - Supabase Auth is **not** used. CRM passwords, sessions, MFA and roles (admin, reader, assigned) live in CRM tables, and FastAPI checks them before every read, write and signed file URL.
  - CRM tables have RLS on, with no anon/authenticated access. Browsers never get a database or service key.
- Runtime database connections use NullPool with prepared statements off, for the transaction pooler. Migrations use a separate direct/session connection (`MIGRATION_DATABASE_URL`).
- Uploads and downloads use short-lived signed URLs, so file bytes bypass Vercel's request-body limit.
- Factory email always returns 403. Signatures stay off. No Zoho writes.

## Environments

Preview and production are fully separate. Each has its own:
- Supabase project, database and bucket;
- `CRM_AUTH_REALM` UUID and `CRM_MFA_ENCRYPTION_KEY`;
- runtime and migration credentials.

Development credentials, sessions and MFA enrolments are never copied to a hosted environment. A hosted login needs an account binding made by `backend.provision_user` for that realm.

## Order of work (after approval)

1. **Accounts and projects.** The owner creates the Vercel project and the Supabase preview and production projects, picks the region (Mumbai) and enters the secrets. Recheck the historical Vercel project `magppie-crm` before any change; unrelated projects are untouched. Do not create `.vercel/project.json` until then.
2. **Schema.** As a separate operator step with `MIGRATION_DATABASE_URL`:
   - apply the Storage SQL in `supabase/migrations`;
   - run `alembic upgrade head`.
   Never run migrations on app start or during a build.
3. **Least privilege.** Create a dedicated runtime role with access only to the CRM tables. Verify RLS and the private bucket policy.
4. **Data.**
   - *Preview:* synthetic data, unless a copy is approved.
   - *Production:* take a final coordinated backup, then import only the approved business data and attachments.
   - Reconcile row fingerprints and attachment hashes ([OPERATIONS](OPERATIONS.md)). On any mismatch, stop.
5. **Identities.** Provision fresh users per role with `backend.provision_user --confirm-target "HOST/DATABASE"`, Admins must enrol an authenticator at their first sign-in; set `CRM_MFA_ENCRYPTION_KEY` first, or admins are blocked. Verify that development cookies and passwords are rejected.
6. **Deploy and verify on the real URL.** Check all of these:
   - login and logout, MFA, recovery mail, and each role's allowed and denied actions;
   - CRUD and Bin restore, and private upload/download;
   - money calculations, and that factory mail returns 403;
   - HTTPS cookies and origin, and Zoho sync duration and cold start within the function limit;
   - mobile.
7. **Operations.** Set up daily database **and** attachment backups, alerts and log retention, and rehearse a restore into a separate database.

## Rollback

- Keep the previous Vercel deployment and the additive schema. Roll back the app by promoting the previous deployment.
- Never roll back to a backend that bypasses hosted identity or MFA.
- A database restore always goes into a new target ([OPERATIONS](OPERATIONS.md)). Reconcile newer writes, then make an explicitly approved connection switch.

## Docker image

The multi-stage `Dockerfile` and `docker-compose.yml` are local verification evidence, not the Vercel artifact. See [deploy/README.md](../deploy/README.md).
