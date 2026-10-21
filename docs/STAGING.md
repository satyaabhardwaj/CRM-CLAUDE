**Superseded deployment target:** use [Vercel + Supabase](VERCEL_SUPABASE.md). This file records the earlier container rehearsal; no cloud deployment occurred.

# Fresh staging deployment

## Verification on 19 October 2026

- Local PostgreSQL integration suite: **14 passed**, including real password login,
  secure cookies, logout, reader/assigned denials and the factory-email block.
- Final Linux container: **14 tests passed** with networking disabled, all six
  React/TypeScript production builds passed. Image runs as non-root; environment
  files, local credentials and client data directories are excluded.
  Tested image ID: `sha256:a403bca8b8619e7e4425b6afde8ffe1ddec052ff81035304117fdaf7ca8d03e7`.
- Backup restored successfully into a new database: **8 public tables and 15
  uploaded files** matched the private manifest. Source client reconciliation:
  **28 clients unchanged**.
- Browser: local Sales and Accounts render saved data after the backend restart.
- Compose configuration validates with placeholders. Online HTTPS, provider
  secrets, off-host backups, and cloud smoke tests remain pending hosting access.
- A Starlette/httpx test-client deprecation warning remains; tests still pass.
- CI is configured, but no remote CI run or cloud deployment has been triggered.

This replaces the deployment approach, not the application or its data. The old
Vercel snapshot remains untouched until a working replacement is verified.
No factory emails are permitted: the FastAPI mail endpoint rejects delivery.

## Architecture and access still needed

Use the supplied Docker image on a Linux container host with a persistent private
uploads volume, behind Caddy HTTPS, and a separate PostgreSQL staging database.
Do not run this disk-backed upload implementation on ephemeral serverless storage.
The connected Vercel project has no database environment variables; a host,
database, staging DNS name, and private backup destination must be supplied.
No paid infrastructure or subscription is created by this setup.
The storage constraint is documented in the
[Vercel runtime documentation](https://vercel.com/docs/functions/runtimes).

## Build and launch

1. `docker build --load -t magppie-crm:RELEASE .` builds all six React frontends
   with their lockfiles and installs pinned backend dependencies. Base Node/Python
   images are pinned by digest. Record the resulting image digest per release.
2. Copy `deploy/staging/.env.example` to ignored `.env` beside `compose.yml`.
   Set the exact HTTPS origin, host, image and separate staging database URLs.
   Mount the database provider CA file read-only. Never use the local dummy login
   on an internet-facing staging service. Pin Caddy to an approved image digest
   before launch; its supplied tag is a preparation default.
3. Prepare an **empty, separately named** staging database. Restore a verified
   private backup into it; never restore over the source CRM. Run migrations with
   the migration owner: `python -m alembic upgrade head`. Configure the application
   DB user with the necessary table/sequence grants, without database-creation
   privileges. Keep migration credentials out of the long-running app environment.
4. Restore uploads into the named volume, owned by UID 10001. Keep all attachments
   private; downloads require an authenticated client grant. Mount integration
   secrets separately at their documented paths; no keys are copied into images.
   Configure Zoho read access before testing Measurement. Do not mount SMTP keys.
5. On the **staging copy only**, remove copied session rows and disable copied demo
   users. Provision unique users interactively with
   `python -m backend.provision_user --email USER --role admin` (or `reader`).
   This command adds accounts without replacing existing accounts or sessions.
   Use `backend.manage grant` for explicitly assigned client access.
6. In `deploy/staging`, run `docker compose --env-file .env up -d` after setting
   DNS and allowing HTTPS ingress. App and database ports must not be public.
   This is a single-worker deployment; login throttling is process-local.

## Permissions and release checks

Admin has workspace read/write and external integration access. Reader has
workspace read-only access. Assigned users have only explicitly granted clients
through the API; the full dashboard is intentionally unavailable to them.
Department-specific UI permissions are not implemented. Do not promise them.

Run `python -m pytest backend/tests -q`; use `TEST_DATABASE_URL` for PostgreSQL
integration tests in isolated test schemas. Check `/api/health`, login failures,
secure HttpOnly cookies, logout, reader write denial, assigned cross-client denial,
all five screens, uploads/download authorization and Zoho data on the actual HTTPS
staging URL. Test writes using synthetic records in staging only. Verify factory
mail requests return 403 without contacting SMTP. Local checks do not replace
online verification.

## Backups and recovery

The JSON-only `scripts/backup.py` is not a PostgreSQL backup. Pause app writes,
then run on a trusted host with PostgreSQL client tools and the source settings:

```
python scripts/backup_postgres.py --output PRIVATE_NEW_DIRECTORY --writes-paused --restore-check
```

This creates a custom-format dump, copies uploads, hashes every public table and
file, restores into a newly generated `crm_restore_*` database and compares the
restored data. It refuses to overwrite an output directory. It leaves the rehearsal
database for inspection; its exact name is in the private manifest. It never
drops an existing database. Writes must stay paused during the operation; no
cross-resource transaction between PostgreSQL and files is claimed.

Backups contain customer data, password hashes and sessions. Keep them encrypted
off-host with restricted access. The local `.local/backups` copy alone is not a
disaster-recovery solution. Configure daily backups, retention and failure alerts
with the selected host, and rehearse restores monthly. Establish RPO/RTO from the
actual schedule and measured recovery; neither is guaranteed by these scripts.

For rollback, stop writes and retain a fresh backup, switch to the previous image
digest and start it against a compatible schema. If a schema rollback is required,
restore to a **new** database, verify it and its matching uploads, then switch the
connection and volume. Never run `docker compose down -v` on a data-bearing stack.
Retain the original source database and attachments throughout cutover.
