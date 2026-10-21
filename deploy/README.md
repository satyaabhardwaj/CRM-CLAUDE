# Container verification and future deployment

The planned hosted target remains Vercel + Supabase. This Compose stack is a local verification option, not a cloud deployment. Do not use the historical `deploy/staging/compose.yml` for the current Supabase architecture.

## Local container

1. Start `Start CRM.cmd` to bring up Docker and local Supabase.
2. Run `.venv/Scripts/python.exe scripts/prepare_container_local.py --port 4302`.
3. Run `docker compose --env-file .local/compose.env -f docker-compose.yml -f deploy/compose.local.yml config --quiet`.
4. Run `docker compose --env-file .local/compose.env -f docker-compose.yml -f deploy/compose.local.yml up -d --build --wait`.
5. Open `http://127.0.0.1:4302/login`. Use the existing CRM account.

The helper writes ignored `.local/container.env` and `.local/compose.env`. Never print or commit these files. Rerun the helper after changing local credentials or ports. It copies configured Zoho credentials only into the private runtime environment; never into the image.

The app joins the existing `magppie-crm-loopback` network. Database and Storage durability belong to the Supabase-managed volumes; the stateless CRM container needs no writable data volume. Never run `supabase db reset`, `docker volume prune`, or `down --volumes` against the existing dataset.

## Ports

| Service | Host port | Container connection |
|---|---:|---|
| Native CRM | 4301 by default, from CRM_ORIGIN | Not used by container |
| Audit CRM | 4302 by default, from CRM_PORT | 8000, fixed image contract |
| Supabase API / Storage | 56321 | supabase_kong_magppie-crm-dev:8000 |
| PostgreSQL | 56322 | supabase_db_magppie-crm-dev:5432 |
| Supabase Studio | 56323 | CLI managed |
| Local mail viewer | 56324 | CLI managed |
| Shadow DB / disabled pooler | 56320 / 56329 | Reserved, not app endpoints |
| Historical standalone / old DB | 4300 / 54329 | Retained recovery path only |

All published development ports stay on loopback. `SUPABASE_INTERNAL_URL` is an explicit development-only HTTP transport override; signed browser URLs always use public `SUPABASE_URL`. Do not use Docker-internal names in browser links. Use `CRM_PORT` plus matching `CRM_ORIGIN`; the helper sets both consistently. Supabase ports are defined in `supabase/config.toml` and validated by the local configuration script.

## Build and runtime

The multi-stage image builds all six React apps using locked npm dependencies and a digest-pinned Node image. The Python runtime uses pinned requirements and runs as UID 10001. Compose enables a read-only filesystem, temporary `/tmp`, dropped capabilities, no-new-privileges, bounded logs, restart policy and a database-aware health check. One worker preserves current in-process integration behavior.

For a future container host, set `CRM_ENV_FILE` to a private runtime env file based on `deploy/container.env.example`. Use HTTPS, hosted PostgreSQL with TLS, and hosted Supabase Storage; omit the local network override and `SUPABASE_INTERNAL_URL`. Never publish the template placeholder credentials. Vercel uses `vercel.json` and the existing `docs/VERCEL_SUPABASE.md` runbook instead of Docker Compose.

## Release, backups and rollback

Pause writes before a coordinated database-plus-attachments backup. Use `scripts/backup_postgres.py --output <new-private-directory> --writes-paused --restore-check` with PostgreSQL client tools available. The script refuses an existing destination and rehearses restore into a new database; never restore over the active database. Keep encrypted off-machine copies and define retention before a hosted launch.

Apply reviewed Alembic migrations before switching traffic; Supabase bucket setup/policies are separately versioned under `supabase/`. Do not re-import JSON into an occupied database. Verify `/api/health`, login, role denials, all five department routes and private downloads after every release.

Keep the previous image digest and backup. For app rollback, set `CRM_IMAGE` to that digest and recreate only `crm` with `--no-build`; preserve Supabase volumes. Database recovery requires a separately restored database and verified attachment set, followed by an explicit connection switch. No destructive automatic downgrade.

Factory emails remain disabled. Hosted TLS, recovery/MFA, rate-limit behavior under multiple instances, monitoring/alert routing, backup scheduling and hosted smoke tests remain release gates. No cloud projects or deployments were created by this audit.
