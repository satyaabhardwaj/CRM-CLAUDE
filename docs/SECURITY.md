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
- **Policy (decided 22 Oct 2026): admins must use MFA; reader and assigned users may opt in.** It is enforced on the server in `backend/mfa.py` (`REQUIRED_ROLES`) and `backend/app.py` (`who`):
  - An admin without an enabled authenticator can still sign in, but every data API returns 403 with `mfa_enrollment_required: true`. Every page redirects to `/security`.
  - Until the admin enrols, only login/logout, `/api/auth/me`, `/security` and the MFA endpoints work.
  - Admins cannot disable their authenticator; they can still replace their recovery codes.
  - **Hosted (preview/production):** if the encryption key or the MFA tables are missing, admins are blocked (fail closed).
  - **Development:** on a laptop without `CRM_MFA_ENCRYPTION_KEY`, the policy cannot be met, so it is not enforced there.
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

**Owner: Satya Bhardwaj.** Use this procedure when a user has lost both the authenticator app and every recovery code. Password reset never removes MFA, and there is no shared bypass.

1. **Verify identity outside the CRM.**
   - Use a channel already on record, such as a video call or in person, plus a call-back on a phone number already on record.
   - Never act on an email or chat request alone.
   - For an admin, a second admin or the owner must also confirm.
2. **Check the request is genuine:** the account exists, it is active, and the request matches the person. Note a ticket or reference.
3. **Run the reset** from a trusted operator terminal, with the destination configuration injected privately:

   ```powershell
   .venv\Scripts\python.exe -m backend.reset_mfa --email "USER_EMAIL" --confirm-target "HOST/DATABASE" --identity-verified
   ```

   The command:
   - removes only that user's authenticator, recovery codes, pending challenges and sessions;
   - records `mfa.operator_reset` in `crm_audit`;
   - leaves the password, role and grants unchanged.
   Hosted targets also need an explicit `CRM_ENV` and the matching realm.
4. **Tell the user to sign in and enrol again at once.** Admins are sent straight to `/security` and cannot use the workspace until they do.
5. **Record** who asked, how identity was verified, who ran the reset, and when. Record no secrets or codes.

If the person cannot be verified, do not reset; escalate to the owner. A suspected account takeover is an incident (see [OPERATIONS](OPERATIONS.md#incidents)).

## Secrets

All secrets are server-only. Their names, owners and rotation are in [PRODUCTION_SECRETS](PRODUCTION_SECRETS.md). Never put a secret in a `VITE_` variable, Git, logs, screenshots or chat.

Local development secrets are in the ignored files `.env.local` and `.local/container.env`. They have been synced by OneDrive (see [CHANGELOG](../CHANGELOG.md), 21 Oct) and must never be reused for preview or production.
