# Local setup

The CRM runs locally on this Windows laptop. FastAPI serves the app on http://127.0.0.1:4301, backed by local Supabase: PostgreSQL on 56322 and private Storage on 56321. No cloud deployment is authorized; see [DEPLOYMENT](DEPLOYMENT.md).

## Daily start

Double-click **Start CRM.cmd** in the project root. It:

1. starts Docker Desktop if needed;
2. starts the local Supabase stack;
3. checks loopback-only port bindings and the existing environment;
4. checks the database;
5. starts CRM in the background and opens the browser.

Healthy services are reused, and concurrent clicks are locked. A second double-click while CRM is running takes about 10 seconds and opens the browser on the same server. Closing the window after success does not stop CRM. Failures stay visible and never kill processes, reset data, migrate schemas, change credentials or deploy.

After a reboot, the same double-click is enough: it starts Docker Desktop if it is closed (allow up to 2 minutes), then Supabase from its existing volumes, then CRM.

Private logs are in `.local/launcher.log` (Supabase keys and database passwords are redacted) and `.local/crm-launcher.{out,err}.log`.

## Daily stop

Double-click **Stop CRM.cmd**. It:

1. stops the CRM server on 4301, but only if that server was started from this folder's `.venv` (anything else on the port is left alone and reported);
2. stops local Supabase with plain `supabase stop`, which keeps all data in the Docker volumes.

Docker Desktop is left running; quit it from the tray if you want. To stop only the database, run `npm run db:stop`.

## Do not

- **Do not update the Supabase CLI.** It is pinned to 2.75.0 in `package.json` on purpose; 2.121.0 stalled on Windows here. The launcher log shows "A new version of Supabase CLI is available" on every start: ignore it.
- **Never** run `supabase db reset`, `supabase stop --no-backup`, `docker compose down --volumes` or `docker volume prune` here.
- Do not run the CRM from another copy of this folder. Only one server can own port 4301, and the launcher reuses whichever healthy server it finds.

## Ports

| Service | Port |
|---|---:|
| CRM (FastAPI, native) | 4301 |
| CRM (Docker verification image) | 4302 |
| Supabase API / Storage | 56321 |
| PostgreSQL | 56322 |
| Supabase Studio | 56323 |
| Local mail viewer | 56324 |

All ports listen on 127.0.0.1 only. Port 4300, the old standalone JSON server, is retired; its code is on branch `archive/legacy-2026-10`.

## First-time machine setup

1. Install Node 24, Python 3.12 (CI and Vercel use 3.12; this laptop's `.venv` is 3.11.9) and Docker Desktop. The project pins Supabase CLI 2.75.0; 2.121.0 stalled on Windows here.
2. Run `npm ci` in the project root.
3. Create the virtual environment and install the backend packages:
   - `python -m venv .venv`
   - `.venv\Scripts\python -m pip install -r requirements-backend.txt`
4. Create the loopback Docker network once. If it already exists, reuse it.
   - `docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 magppie-crm-loopback`
   - In Docker Desktop, set **Settings > Resources > Network > Port binding behavior > Localhost by default**. The configuration generator refuses wildcard bindings.
5. Run `npm run db:start`. The project id is `magppie-crm-dev`. Data lives in the Docker volumes `supabase_db_magppie-crm-dev` and `supabase_storage_magppie-crm-dev`.
6. Run `python scripts/configure_supabase_local.py`. It writes the ignored `.local/supabase.env`.
7. For an **empty** workspace only:
   - copy that file to `.env.local`;
   - run `npm run db:migrate`;
   - run `python -m backend.seed_local`. It refuses non-local URLs and an occupied database.
   - Create an admin with `python -m backend.provision_user --email EMAIL --role admin`. The password is entered at a hidden prompt.
   - **Or, on a laptop only:** `python -m backend.local_admin` creates `admin@magppie.local` (or `--email EMAIL`) with a password of at least 8 characters, typed at a hidden prompt. If that email already exists, it gets the new password, the admin role and active status again, and its sessions end. It refuses anything but a development database on localhost. Each clone has its own database, so run it once on every laptop. If `CRM_MFA_ENCRYPTION_KEY` is set in `.env.local`, the admin must set up an authenticator after signing in; put `# ` before that line and restart the CRM for password-only sign-in on that laptop.
8. Run `npm run build` to build all six frontends, then **Start CRM.cmd**.

`.env.local` takes precedence over the older `.local/backend-local.json`. Exported process variables take precedence over both. The Vercel entrypoint loads no local env file.

## Frontends

Each department has its own React + TypeScript app: `sales/react`, `design/react`, `accounts/react`, `measurement/react`, `management/react`, and `backend/react` for login and account security. For each one:

```powershell
npm ci --prefix sales/react
npm run build --prefix sales/react
npm test --prefix sales/react
npm run format:check --prefix sales/react
```

`npm run build` in the root builds all six.

## Checks

- `python -B scripts/check.py`: syntax, foundation and Measurement checks.
- `.venv\Scripts\python.exe -m pytest backend/tests -q`: backend tests.
  - Without `TEST_DATABASE_URL`, they run on SQLite. Three realm tests need PostgreSQL's cascading deletes and fail on SQLite.
  - For the real suite, set `TEST_DATABASE_URL` to a separate local `crm_crud_test_*` database. The tests refuse any other database.
  - The optional Storage test needs `RUN_LOCAL_SUPABASE=1` and a new QA bucket.

## Docker verification image (optional)

See [deploy/README.md](../deploy/README.md). It runs the same image on 127.0.0.1:4302 against the same local Supabase.

## Measurement (Zoho)

Measurement reads Zoho Orders read-only, through the backend. Credentials come from the file named in the ignored `measurement/backend/env-path.txt`, or from `MEASUREMENT_ENV_FILE`. The required keys are `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` and `ZOHO_REFRESH_TOKEN`. On this laptop the file is `C:\Users\am600\Magppie-Keys\crm-measurement-zoho.env` (only the `ZOHO_*` lines, outside OneDrive and outside the project). After changing it, restart with **Stop CRM.cmd** and **Start CRM.cmd**. See [measurement/README.md](../measurement/README.md).
