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

**Nightly backup (set up 23 Oct 2026, currently turned off at the owner's request to save disk space; turn it on in Task Scheduler â†’ "MAGPPIE CRM daily backup" â†’ Enable).** Windows Task Scheduler runs `scripts\daily_backup.py` every night at 23:00 (task "MAGPPIE CRM daily backup"; if the laptop is off, it runs at the next start). Each run:
- starts Docker and the local database if needed (data kept);
- makes `.localackups\daily-YYYYMMDD-HHMM` with `--restore-check`, then drops only its own rehearsal database;
- retries three times, 10 minutes apart, if someone was working during the backup;
- keeps 30 days of `daily-*` folders (always the newest three); hand-made backups are never touched;
- writes one line to `.localackups\daily-backup.log` (`"ok": true` with table and attachment counts, or the reason it failed).

Check it: open `daily-backup.log` and look at the last line. Run it now: `.venv\Scripts\python.exe -B scripts\daily_backup.py`. Change the time: Task Scheduler â†’ "MAGPPIE CRM daily backup" â†’ Triggers. The backups stay on this laptop; copy one off the machine (encrypted) regularly, because a lost or broken laptop takes them with it.

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

## Staff accounts

Day to day, an administrator uses Management â†’ **Users** (needs an authenticator). The command line does the same: `python -m backend.users â€¦` (outside development add `--confirm-target HOST/DATABASE`).

| Situation | What to do |
|---|---|
| Someone joins | Users â†’ Add person: email and role (sales, design, measurement, accounts, reader; admin only if needed). Give them the temporary password privately (it is shown once); they choose their own at first sign-in. Admins must then set up an authenticator. |
| Someone changes department | Change the role. They are signed out and see the new access at their next sign-in. |
| Someone leaves | Deactivate. All their sessions end at once and they cannot sign in; their history stays. Never delete accounts. |
| Forgotten password | Reset password. They are signed out everywhere, get a temporary password (shown once) and must choose a new one at sign-in. Their authenticator is kept. Email recovery stays off. |
| Lost authenticator (and all recovery codes) | Follow "Lost MFA" in [SECURITY](SECURITY.md) (operator, `backend.reset_mfa`). A password reset never removes MFA. |
| The sign-in code email does not arrive | Check spam, then "Send a new code" (after 30 s, three times). If the mailbox or Google is down, an operator on the laptop sets `CRM_EMAIL_OTP=0` in `.env.local` and restarts the CRM; sign-in is then password-only until it is set back to `1`. With the Gmail API set up (`scripts\set_gmail_api.py`) mail goes over HTTPS and does not depend on port 587; re-run that script if Google revoked access. |
| The only administrator is unavailable | The last active administrator cannot be removed or demoted. Keep at least two active administrators with authenticators. |

## Incidents

1. **Contain.**
   - For suspected account compromise: deactivate the user on the Users page (all sessions end at once), then reset their password before reactivating.
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

## Historical 4300 standalone server

The JSON server and backup commands are retired on `archive/legacy-2026-10`. Its data remains in the encrypted archive above. Use the PostgreSQL backup/restore procedure for the current CRM; never restore the retired JSON flow into an active workspace.
