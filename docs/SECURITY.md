# Security

Current behaviour of the CRM's identity, permission and secret handling. The implementation notes and test evidence are in [history/AUTH_REALMS.md](history/AUTH_REALMS.md), [history/MFA.md](history/MFA.md) and [history/ACCOUNT_RECOVERY.md](history/ACCOUNT_RECOVERY.md).

## Boundary

FastAPI is the only data path. Browsers never get database credentials or the Supabase service key.

Every CRM table (Alembic 0001–0010) has:
- RLS enabled;
- PUBLIC, anon and authenticated access revoked.

`scripts/restore_postgres.py` re-applies the same rules after a restore.

Writes need:
- a same-origin request (Origin/CSRF checks);
- a valid host;
- a session with permission.

Factory email returns 403. Signatures are off, and there are no Zoho writes.

## Roles

Decided 22 Oct 2026. Enforced on the server in `backend/permissions.py`; the screens only reflect it.

| Role | Can do |
|---|---|
| admin | Everything: every module, edits, uploads, approvals, settings, user administration (with MFA) |
| sales | Edits Sales; views every other module |
| design | Edits Design; views every other module |
| measurement | Edits Measurement; views every other module |
| accounts | Edits Accounts and gives the four Accounts approvals (Booking to Design 50%, Production drawing 80%, Factory go-ahead 80% + PDI, Dispatch 100%); views every other module |
| reader | Views everything; edits nothing (Management uses this) |
| assigned | Only granted clients, through `/api/clients` and `/api/clients/{id}`; writes only with an explicit write grant; no whole-workspace dashboards |

MFA is required for admin only; optional for everyone else. Staff "viewing" dropdowns are business filters, not permissions.

### Department roles: what each may change

Every save (`PUT /api/store` and `PUT /api/clients/{id}`) is compared field by field with the stored copy. Any change outside the caller's department is refused with 403 ("… access cannot change <field> on <client>. Nothing was saved.") and the whole save rolls back. Admin is unchecked; reader cannot save at all.

Screens fill in defaults before saving (`shared/rules.js` `L.ensure`, and `L.flow` in Design). The server fills the same defaults into the stored copy first (`with_defaults`), so a default never counts as an edit. `backend/tests/test_permissions.py` checks this against the real `rules.js`; on 22 Oct it matched all 28 live clients.

| Client field | Who may change it |
|---|---|
| `gates.*` (the four Accounts approvals), `pis`, `accountsOperations`, `approvalNotes` | accounts |
| `factoryAt`, `factoryMail` | accounts, design |
| `post.*` (EPT, appliances, design, PDI), `drawingSignedAt`, `timelineChanges`, `approvals.timeline` | design |
| `approvals.plan` | admin only |
| `design.*`, `timeline.*` | sales, design |
| `measurement` | design and measurement: all of it; sales: create the first request and set its date |
| `payment.receipts` | sales: add "Requested" receipts, withdraw ones not confirmed; accounts: add confirmed receipts and decide requested ones (status, date, reason, notes only) |
| `approvals.booking` | sales: set "Pending"; accounts: "Approved" or "Rejected" |
| `stage` | sales: any; accounts: "booked" only |
| `bookedAt`, `payment.tokenPlan`, `payment.tokenBy` | sales, accounts |
| `news` (activity log) | sales, design, accounts: add entries on top only |
| every other client field | sales |
| a new client | sales |

Outside the client list: `architects` and `people` are Sales'; `seen.design`, `seen.accounts`, `seen.measurement` belong to that department and other `seen` entries (personal bells) to Sales; everything else (for example `settings`) is admin only. Removing clients or architects stays refused for everyone.

Other actions: departments may attach files to any client (the record change itself is checked on save). OCF signing, voice notes and scratch uploads are for sales and admin. Factory mail is refused for everyone while it is disabled.

## Sessions and login

- Passwords are salted PBKDF2-HMAC-SHA256 with 600,000 iterations. Every password that is set (provisioning, Users page, reset link, change, local admin) must be 12–1024 characters (`backend/passwords.py`).
- A session is a random HttpOnly cookie (`crm_session`), SameSite=Strict, Secure when the origin is HTTPS. Only its hash is stored.
- **Sliding sessions (decided 22 Oct 2026):** a session ends after `CRM_SESSION_IDLE_MINUTES` (default 240) without real use and at most `CRM_SESSION_MAX_HOURS` (default 12) after sign-in.
  - Real use renews it, at most once a minute: a save or other change, opening a page, or `POST /api/auth/activity` (sent by the page after keyboard or mouse use, or by "Stay signed in"). Background polling (`GET /api/...`) and requests marked `X-CRM-Background: 1` never do, so an idle open tab still signs out.
  - `GET /api/auth/me` reports `idle_expires_at`, `expires_at` and the server's `now`. Two minutes before the end every module page shows a "Stay signed in" dialog; near the 12-hour limit it explains that there is no extension.
  - When a session ends, unsaved client changes are kept in that browser tab (`sessionStorage`, per user, module and client; no secrets) and saved once after signing in again, on the newest copy; a client changed by someone else meanwhile is never overwritten. Sign-in returns to the page (`next`, same-site paths only).
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

## Sign-in code by email

Decided 23 Oct 2026 (owner: the admin `info@mymagppie.com` signs in with a code sent to that mailbox).

- **On** when `CRM_EMAIL_OTP=1` and the reset-link mail settings (`RECOVERY_SMTP_*`, `RECOVERY_MAIL_FROM`) are present; `scripts/set_recovery_mail.py` sets both after a real test email went out. If `CRM_EMAIL_OTP=1` is set without the mail settings, the CRM refuses to start.
- **Who:** an active account whose sign-in email is its verified mailbox (`crm_recovery_emails`, set by `backend.recovery_email --ownership-verified` or by the owner's request) and that has no authenticator app. An enabled authenticator is used instead. In preview and production it does not replace the authenticator admins must have.
- **Flow:** the password returns 202 `{"mfa_required": true, "method": "email", "to": "i***@…"}` and a ten-minute HttpOnly challenge cookie (`crm_email_challenge`), with no access to anything. A six-digit code is emailed; `POST /api/auth/email-code/verify` with it issues the normal session. "Send a new code" (`POST /api/auth/email-code/resend`) after 30 seconds, three times at most; only the newest code works.
- **Limits:** 5 wrong codes end the challenge; 10 verify attempts per user per hour; the code expires after 10 minutes; one pending challenge per user.
- **Storage:** only hashes (`crm_login_codes`, migration 0010). The code hash is bound to the challenge cookie, so the table alone cannot be brute-forced; a password change or sign-out cancels a pending code.
- **Mail down:** nobody is signed in and the screen says the code could not be sent. An operator on the laptop can set `CRM_EMAIL_OTP=0` in `.env.local` and restart to sign in with the password alone.

## Changing your password

- **Where:** Account security (`/security`), section "Change password". Endpoint `POST /api/auth/password` in `backend/mfa.py`.
- **Needs:** the current password, plus an authenticator or recovery code when an authenticator is enabled. An admin who has not enrolled yet must enrol first (403). Reader and assigned users without an authenticator use the password alone.
- **New password:** 12–1024 characters (the one rule) and different from the current one.
- An admin on a laptop where no authenticator can be set up (no `CRM_MFA_ENCRYPTION_KEY`) changes the password with the current password alone.
- After an administrator's reset (or on a fresh laptop's first admin) the person must choose a new password before anything else opens: every data API answers 403 `password_change_required` and pages go to `/security`.
- **Effect:**
  - every other session of that user ends; the session that made the change stays signed in;
  - open reset links and pending sign-in challenges for that user are cancelled;
  - MFA is unchanged, and the audit log records `auth.password_changed`.
- **Limits:** ten attempts per user per hour, 100 globally per hour. A wrong code or password counts as an attempt; a used code cannot be replayed.

## Users page (administrators)

- Management → **Users**, shown to administrators only; `GET/POST /api/admin/users…` in `backend/user_admin.py`, rules in `backend/users.py`. The same rules are on the command line: `python -m backend.users list|add|role|deactivate|reactivate|reset-password` (outside development add `--confirm-target HOST/DATABASE`).
- Needs an administrator with an enabled authenticator (on a development laptop without the MFA key, the same exception as the admin MFA rule).
- **Add:** email and role; a 16-character temporary password is shown once; the person must choose their own at first sign-in. Hosted environments bind the new account to the environment's realm automatically.
- **Change role:** the person is signed out so every screen starts with the new access.
- **Deactivate:** signs the person out everywhere at once and blocks sign-in; nothing is deleted. **Reactivate** restores sign-in.
- **Reset password:** a new temporary password shown once; all sessions end; the authenticator stays; a new password is required at the next sign-in. This is how a forgotten password is handled (email recovery stays off).
- **Guards:** nobody can deactivate or demote themselves; the last active administrator can never be deactivated or demoted; users are never deleted.
- Every action is audited: `user.create`, `user.role`, `user.deactivate`, `user.reactivate`, `user.password_reset`. The list shows email, role, active, authenticator on/off and last sign-in; never a password, hash or session.

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
