# Vercel + Supabase foundation

Status: local implementation and future deployment preparation only. Do not run
Vercel deploy, Supabase link/db push, create hosted projects, or upload customer
data to a cloud service without a new explicit instruction.

Local cutover completed on 21 October 2026: the CRM now uses local Supabase
PostgreSQL (56322) and private Storage (56321). All 28 clients, the original CRM tables,
existing credentials/grants and 15 attachments were reconciled before activation.
Original PostgreSQL and filesystem uploads remain intact for recovery.
See `VERCEL_SUPABASE_VERIFICATION.md` for the original cutover. Subsequent auth migrations through 0006 are active locally; current regression, backup restore and private Storage evidence are in `FINAL_DEPLOYMENT_CHECKLIST.md`. Recovery delivery remains disabled; MFA enrollment is opt-in.

## Responsibilities

| Location | Responsibility |
| --- | --- |
| sales/react, design/react, accounts/react, measurement/react, management/react | Native React/TypeScript feature UI, business presentation and feature tests |
| backend/react | Login and session UI |
| shared | Existing calculation rules, formatting/PDF services, shared direct-upload transport |
| backend/app.py | Same-origin API, session enforcement and protected page routes |
| backend/auth.py, rate_limit.py | Existing password/session contracts and shared PostgreSQL login throttling |
| backend/repository.py, models.py | Transactional CRM data access and resource authorization |
| backend/storage.py | Private Supabase attachments; filesystem remains a local rollback option |
| backend/migrations | Canonical Alembic migrations for CRM tables; no competing SQL definitions |
| supabase/config.toml, migrations | Local service configuration and private Storage bucket migrations |
| scripts | Explicit build, backup, local environment generation and non-overwriting migration tools |
| backend/server.py, pyproject.toml, vercel.json | Future Vercel FastAPI entrypoint and build configuration |

Retain feature ownership: add feature components under that module's React src;
shared business rules stay in shared, authorization stays on the server, and all
database changes get a new Alembic revision. Never import another feature's UI.
Legacy source is retained for comparison; active module entries use native React.

## Architecture decisions

Vercel serves the current React pages and FastAPI API at one origin. Supabase
provides PostgreSQL and a private Storage bucket. Existing CRM password hashes,
cookie sessions and admin/reader/assigned grants are preserved in PostgreSQL;
this phase does **not** silently replace them with Supabase Auth accounts.
Supabase anon/authenticated roles have no access to CRM tables. The FastAPI server
enforces roles and client grants before every read/write and signed file URL.
Assigned users have client API access only, not the whole-workspace dashboards.

Runtime DB connections use NullPool and disabled prepared statements for the
transaction pooler. Migrations use a separate direct/session connection. Login
attempt limits are shared in PostgreSQL rather than process memory. Private
uploads use scoped signed URLs so file bytes bypass Vercel's request body limit.
No service key is embedded in frontend code. Factory mail always returns 403.

## Local setup

For the configured Windows machine, double-click **Start CRM.cmd** at the project
root. It starts Docker Desktop if needed, starts this local Supabase stack,
validates loopback bindings and the existing environment, checks the database,
starts CRM in the background, then opens the default browser. Existing healthy
services are reused; concurrent clicks are locked. Closing the launcher window
after success does not stop CRM. Failures remain visible and do not kill existing
processes, reset data, migrate schemas, change credentials or deploy anything.
Private diagnostic logs are under `.local/launcher.log` and
`.local/crm-launcher.{out,err}.log`. The launcher requires the already-installed
Docker Desktop, Node/npm, pinned CLI and Python virtual environment.

1. Install Node 24, Python 3.12 and Docker Desktop. The project pins Supabase CLI 2.75.0 with a patched tar override; 2.121.0 stalled during Windows local startup in this environment. Run `npm ci` and
   `python -m pip install -r requirements-backend.txt` in your virtual environment.
2. Create the local-only network once:
   `docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 magppie-crm-loopback`.
   If it already exists, inspect/reuse it rather than recreating it.
   On Docker Desktop, also select **Settings > Resources > Network > Port binding
   behavior > Localhost by default** and apply the setting before starting.
   The network option alone was insufficient on this Windows machine: Docker
   published `0.0.0.0` and IPv6 wildcard ports. The configuration generator now
   refuses those bindings, so real CRM data is not copied into an exposed stack.
   Stop/restart the local Supabase services after applying the Docker setting;
   confirm published HostIp values are `127.0.0.1` or `::1`.
   This machine is now configured with `PortBindingBehavior=default-local-port-binding`;
   the previous Docker settings are privately backed up in
   `.local/docker-settings-before-loopback.json`. This changes the Docker-wide
   default for implicit port bindings; explicit per-container mappings still apply.
3. Run `npm run db:start`. The project ID is `magppie-crm-dev`; API 56321,
   PostgreSQL 56322, Studio 56323. No Supabase login or cloud linking is needed.
   First startup downloads official images. Never use `stop --no-backup` or
   `db reset` against the data-bearing development project.
4. Run `python scripts/configure_supabase_local.py`. It saves credentials in
   ignored `.local/supabase.env`; it does not change the current app connection.
5. For an empty development workspace, copy that file to `.env.local`, run `npm run db:migrate`, then
   `python -m backend.seed_local`. Seed refuses non-local URLs and an occupied DB.
   Use `python -m backend.provision_user --email EMAIL --role admin` to create a
   password interactively; no fixed password is committed.
6. For the existing CRM, pause writes and instead run
   `python scripts/migrate_to_local_supabase.py --writes-paused`.
   It copies CRM tables/accounts and attachments into empty local Supabase,
   compares all rows and file bytes, refuses differing destination data, and
   leaves the old database and files untouched. Only after success copy
   `.local/supabase.env` to `.env.local`, retaining a private configuration backup.
7. `npm run build` builds all six frontends. `run-backend.cmd` opens the unchanged
   app at `http://127.0.0.1:4301`. `npm run db:stop` preserves local service data.

Local `.env.local` takes precedence over the old `.local/backend-local.json`
fallback; exported process variables take precedence over both. No local env file
is loaded by the Vercel entrypoint. Use `.env.production.example` as the future
server-only variable contract, never copy local credentials to production.

`run-backend.cmd` now checks a real database connection before starting the web
server. While the original development configuration is active, it starts the
existing project-owned `.local/postgres` cluster if stopped. It never initializes
or resets a database. With `.env.local` or a different database URL, it only checks
readiness; start Supabase separately using `npm run db:start`. A successful login
page HTTP response alone is not a database health check.

## Future deployment gate

The old snapshot publisher is disabled and its prior source backed up privately
under `.local/retired-deployment`. The last recorded cloud project (not rechecked in this local task) is
`magppie-crm` (`prj_Fb4pDLafxWGaPKVKI7kxvokGCCvh`); the connector requires user
confirmation in Vercel to delete it. It has **not** been deleted by these files.
Unrelated projects, including the helper project, are not changed.

Fresh `vercel.json` has Git auto-deployment disabled and contains no old project
ID. `.vercelignore` excludes private data, env files and old snapshot artifacts.
Do not create a `.vercel/project.json` link until deployment is explicitly requested.

After future approval: create the separate Supabase project, apply Storage SQL
and Alembic migrations, configure a least-privilege backend role with CRM-only
table permissions/RLS access, verify TLS, create unique production accounts,
and copy only approved customer data and attachments with reconciliation. Revoke
copied development sessions and credentials on the destination before exposing it.
Then configure Vercel server variables and exact origin, deploy, and test the
actual hosted URL. Do not run migrations on function startup or during frontend builds.

Verify domain/host routing, secure cookies, login/logout, role denials, all five
modules, concurrent edits, signed uploads/downloads, Zoho requests and disabled
factory email. Request-body/platform-duration limits still apply to API payloads;
large voice/signature payloads use the private temporary-object transport and are
deleted when consumed. Abandoned uploads require a production retention policy. No hosted compatibility is
claimed solely from local tests.

Back up both PostgreSQL and Storage objects; a database dump does not contain
attachment bytes. Retain the original local source during cutover. Production
PITR, retention, encrypted off-site backup and restore rehearsal must be enabled
and verified on the selected Supabase plan after deployment authorization.

References: [Supabase local CLI](https://supabase.com/docs/guides/local-development/cli/getting-started),
[Vercel FastAPI](https://vercel.com/docs/frameworks/backend/fastapi).

## Local rollback and verification

Before activation, keep the old `.local/backend-local.json`, original PostgreSQL
database and `.local/migration-uploads` intact. To roll back before accepting new
writes, stop the local app, move the new `.env.local` to a private backup name,
and restart `run-backend.cmd`; the original configuration is used again. If new
writes have occurred after cutover, first pause writes and reconcile those changes
back to the original database and uploads. Never switch blindly and lose new work.

Run each module's `npm --prefix MODULE/react test`, the root `npm run build`, and
`.venv/Scripts/python.exe -m pytest backend/tests -q`. The opt-in Storage check
requires local configuration exported and `RUN_LOCAL_SUPABASE=1`; it uploads a
synthetic 5 MB private file, verifies signed download/public denial and deletes
only its generated test object. Its default skip is not a successful integration
check. For PostgreSQL API tests, set `TEST_DATABASE_URL` to a separate local `crm_crud_test_*` database; tests create uniquely named schemas. Never point tests at the live CRM database or bucket. For Storage use a new private QA bucket; the existing opt-in test deletes its synthetic object and requires explicit cleanup authorization.

For a consistent local backup rehearsal, pause app writes and run
`python scripts/backup_postgres.py --output .local/backups/UNIQUE-NAME --writes-paused --restore-check`.
The output directory must be new; restoration creates a separate database and
never overwrites the source. Keep backup files private. A hosted restore requires
a separately authorized target and is outside this phase.
