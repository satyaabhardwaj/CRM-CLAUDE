# Security

Current behaviour of the CRM's identity, permission and secret handling. The implementation notes and test evidence are in [history/AUTH_REALMS.md](history/AUTH_REALMS.md), [history/MFA.md](history/MFA.md) and [history/ACCOUNT_RECOVERY.md](history/ACCOUNT_RECOVERY.md).

## Boundary

FastAPI is the only data path. Browsers never get database credentials or the Supabase service key.

Every CRM table (Alembic 0001–0006) has:
- RLS enabled;
- PUBLIC, anon and authenticated access revoked.

`scripts/restore_postgres.py` re-applies the same rules after a restore.

Writes need:
- a same-origin request (Origin/CSRF checks);
- a valid host;
- a session with permission.

Factory email returns 403. Signatures are off, and there are no Zoho writes.

## Roles

| Role | Can do |
|---|---|
| admin | Whole workspace: every module, edits, uploads, approved side effects |
| reader | Whole workspace and file reads; no writes, no side effects |
| assigned | Only granted clients, through `/api/clients` and `/api/clients/{id}`; writes only with an explicit write grant; no whole-workspace dashboards |

Staff "viewing" dropdowns are business filters, not permissions.

## Sessions and login

- Passwords are salted PBKDF2-HMAC-SHA256 with 600,000 iterations. Passwords set by provisioning or reset must be 16–1024 characters.
- A session is a random HttpOnly cookie (`crm_session`), SameSite=Strict, valid for at most one hour. It is Secure when the origin is HTTPS. Only its hash is stored.
- Logout deletes the session and any pending MFA challenge.
- Login limits are shared in PostgreSQL:
  - 20 attempts per key per minute, 200 globally;
  - old `auth.attempt` rows are pruned after an hour.

## Environment realms (hosted)

Preview and production require:
- `CRM_ENV`;
- a public HTTPS `CRM_ORIGIN`;
- a unique `CRM_AUTH_REALM` UUID.

Every login and every request must match both an account binding and a session binding (`crm_auth_accounts`, `crm_auth_sessions`). Copied development users, passwords or cookies are therefore rejected. Only `backend.provision_user --confirm-target "HOST/DATABASE"` creates bindings. Keep the realm UUID stable; changing it locks out every bound account.

## MFA (authenticator app)

- **Enrolling:** avatar menu → Account security (`/security`). Enter the password, add the setup key to an authenticator app, confirm a six-digit code, then save the ten recovery codes.
- **Algorithm:** TOTP per RFC 6238 (SHA-1, six digits, 30 s, ±1 step), with replay blocked.
- **Seeds:** encrypted with Fernet using `CRM_MFA_ENCRYPTION_KEY`. Recovery codes are stored only as SHA-256 hashes, and each works once.
- **Login for an enrolled user:** the password returns a five-minute challenge cookie with no API access. A valid code then issues the normal session.
- **Limits:** five failed attempts per challenge, ten per user per hour, 100 globally per hour.
- **Disabling MFA or replacing codes** needs the password plus a code, and it revokes every session.
- **Policy:** enrolment is currently **opt-in**. A mandatory policy is a Phase 5 decision.
- **The key:** losing `CRM_MFA_ENCRYPTION_KEY` blocks every enrolled user. Back it up separately from database dumps and never regenerate it on restart.

## Password recovery

- Recovery is **off** unless `CRM_RECOVERY_ENABLED=1` and the separate `RECOVERY_SMTP_*` and `RECOVERY_MAIL_FROM` values are set. It never uses the factory mail settings.
- `/forgot-password` always answers the same way, whether or not the account exists.
- Only an active account with an operator-verified recovery mailbox gets mail. Enrol one with `backend.recovery_email --ownership-verified`.
- The reset link:
  - expires in 15 minutes and can be used once;
  - carries its token in the URL fragment, which is never logged.
- A reset:
  - changes the password;
  - deletes the user's other reset tokens;
  - revokes all their sessions.
  MFA stays required.
- **Limits:** three requests per email per hour and 100 globally; five attempts per token.

## Lost MFA (operator procedure)

Password reset does not remove MFA, and no shared bypass exists. The operator procedure and its owner are defined in Phase 5. Until then, a user who has lost both the authenticator and the recovery codes needs an admin to perform a reviewed database change.

## Secrets

All secrets are server-only. Their names, owners and rotation are in [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md). Never put a secret in a `VITE_` variable, Git, logs, screenshots or chat.

Local development secrets are in the ignored files `.env.local` and `.local/container.env`. They have been synced by OneDrive (see [CHANGELOG](../CHANGELOG.md), 21 Oct) and must never be reused for preview or production.
