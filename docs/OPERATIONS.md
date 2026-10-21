# Operations

Day-to-day running, backup/restore, secret rotation and incidents for the 4301 CRM. Setup is in [SETUP](SETUP.md), hosting in [DEPLOYMENT](DEPLOYMENT.md), and identities in [SECURITY](SECURITY.md).

## Running

- **Start** with `Start CRM.cmd`, which opens http://127.0.0.1:4301. **Stop** the database with `npm run db:stop`; data is kept.
- **Health:** `GET /api/health` returns `{"status":"ok"}` only after a real database query. A login page that answers is not a database check.
- **Logging:** request bodies and query strings are not logged.
  - Provider failures return errors.
  - An external side effect is never retried automatically after an ambiguous response.
  - Zoho reads have bounded pagination, timeouts and one token-refresh retry.

## Build and CI

GitHub Actions (`.github/workflows/check.yml`) runs on Ubuntu and Windows with Python 3.12 and Node 24, without provider credentials:
- `scripts/check.py`;
- format, test and build for all six frontends;
- the backend tests on PostgreSQL 18 (`crm_crud_test_ci`).

Locally, `python -B scripts/build.py` makes a deterministic source ZIP without data or credentials; compare its SHA-256 before a rollout.

## Backup and restore (current 4301 CRM: PostgreSQL + private Storage)

Backups contain customer data and password/session hashes. Keep them private, outside OneDrive, and encrypted when copied off the machine.

**Backup.** Pause edits, then run (the output directory must be new):

```powershell
$env:POSTGRES_BIN = "C:\Program Files\PostgreSQL\18\bin"
.venv\Scripts\python.exe scripts\backup_postgres.py --output .local\backups\NAME --writes-paused --restore-check
```

It writes `database.dump`, every attachment under `uploads/`, and `manifest.json` (table fingerprints, attachment and dump SHA-256). It fails if data changed during the backup. `--restore-check` restores into a new `crm_restore_<hex>` database and requires the fingerprints to match; drop that database afterwards.

**Restore (one command, repeatable).** It always goes into a NEW database, never over the live one:

```powershell
.venv\Scripts\python.exe scripts\restore_postgres.py --backup .local\backups\NAME --create-database crm_restore_qa_NAME --bucket crm-restore-qa-name
```

For a separately created empty database (for example a new Supabase project), set `RESTORE_DATABASE_URL` in the process environment and omit `--create-database`. `--bucket` is optional; it creates a new private bucket, uploads the attachments and reads every byte back.

The script refuses:
- the live database (same host, port and name as `DATABASE_URL`) or `postgres` when creating;
- an existing database name, or a target whose `public` schema holds any object;
- the live bucket or an existing bucket;
- a backup whose dump, attachment set or attachment bytes differ from its manifest.

How it works:
- The dump contains `CREATE SCHEMA public`, which every new database already has (the 21 Oct duplicate-schema failure). The script restores through `pg_restore --use-list` and skips only that schema entry and its comment. It drops nothing.
- It restores in a single transaction. Because dumps carry no ACLs, it then re-applies the migrations' boundary: RLS on every table, with no PUBLIC, anon or authenticated grants.
- It prints JSON (`tables_match`, `attachments_match`) and exits non-zero on any mismatch. A failed target is left for inspection, never cleaned automatically.

**Switching to a restored database** is a manual, separately approved step:
1. Pause writes.
2. Reconcile any writes newer than the backup.
3. Point `DATABASE_URL` and `SUPABASE_UPLOADS_BUCKET` at the restored copies.
4. Restart, then check health, login and the counts.

Restored development identities and sessions must not become hosted production identities (see PRODUCTION_SECRETS.md).

**Rehearsal (21 Oct 2026).**
- A backup with `--restore-check`, then `restore_postgres.py` into `crm_restore_qa_phase3` and bucket `crm-restore-qa-phase3`.
- All 15 tables and 28 clients matched both the manifest and the live database. All 15 attachments matched byte-for-byte, with 0 public grants and RLS on every table.
- Repeating the command and targeting `postgres` were both refused. All rehearsal databases and the bucket were then dropped; the live fingerprint was unchanged.

## Secret rotation

Follow the rotation steps in [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md#rotation-procedure-for-the-future-operator). Rotate one integration at a time and verify each before revoking the old value.

- **Database credentials:** create a new credential with the same grants, update the secret, redeploy, verify, then revoke the old one.
- **Storage service key:** rotate at the provider, update the server secret, then verify a private upload/download and public denial.
- **Zoho / AI keys:** issue the new key with minimal scopes, restart to drop cached tokens, then revoke the old key.
- **`CRM_MFA_ENCRYPTION_KEY`:** cannot simply be replaced. It needs a reviewed re-encryption, or every enrolled user re-enrolls. Never regenerate it on restart.
- **Archive passphrase** (`C:\Users\am600\Magppie-Keys\`): keep it in the password manager; whoever holds it can read the 2026-10 archive.

## Incidents

1. **Contain.**
   - For suspected account compromise: reset that user's password (this revokes their sessions), or have an operator delete their `crm_sessions` rows.
   - For a leaked secret: rotate it as above.
   - For bad data: pause writes.
2. **Preserve.** Take a new backup before changing anything (`backup_postgres.py`). Never restore over the live database.
3. **Recover.**
   - Restore into a new database with `restore_postgres.py`.
   - Compare it with the live copy, and reconcile any newer legitimate writes.
   - Switch only with approval.
   - Never resurrect revoked accounts or sessions from an old backup.
4. **Record** what happened, when, what was rotated or restored, and the checks run. Record no secret values.

## Archive of old backups and data

`C:\Users\am600\Magppie-Archive\crm-archive-2026-10-21.tar.gpg` (AES-256, with a `.sha256` file next to it) holds:
- 18 older backups;
- the old 4300 `data/` folder;
- the pre-Supabase PostgreSQL cluster (`.local/postgres`);
- `.local/migration-uploads`.

It was verified on 21 Oct: all 3,923 files matched byte-for-byte. To read it, decrypt into a new folder outside OneDrive:

`gpg -d crm-archive-2026-10-21.tar.gpg | tar -xf -`

## Historical 4300 standalone server (archived on branch archive/legacy-2026-10)

The 4300 JSON server, its `data/` folder and `scripts/backup.py` flow are retired. Its last data is in the archive above. The steps below are kept for reference only.

1. Stop the sole CRM server and verify port 4300 is no longer listening. Prevent user edits.
2. Run `python -B scripts/backup.py --server-stopped --destination <private-backup-directory>`. Store encrypted off-device copies with access control and retention; backups contain personal data. The tool creates a new archive and never overwrites/restores files.
3. Before upgrades, preserve the source release, private configuration and a full data backup. Validate archive readability and periodically rehearse restoration in an isolated directory.
4. To restore: stop server, keep the current data directory as a dated recovery copy, extract a trusted backup into a separate directory, validate its store using `core.storage.validate`, compare client counts and attachments, then switch directories manually. Never overwrite the only copy.
5. For a bad latest write, inspect `data/store.previous.json` offline and compare with the full backup. Do not auto-restore: another legitimate edit may be newer.
6. For code rollback, extract the prior known-good source release separately and use a copied compatible data directory. Version 1 is additive; older code ignores its schemaVersion. Start on a test port, run health/navigation checks, then restart the primary instance. Avoid git reset/clean against the user's dirty checkout.
