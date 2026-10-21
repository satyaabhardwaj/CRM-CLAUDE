# Account recovery

Implemented locally, 2026-10-21. No live migration, user enrollment, real mail or cloud action has been performed. Authenticator MFA is now documented in [MFA.md](MFA.md); password reset does not bypass an enrolled factor.

## Flow and protection

- `/forgot-password` requests a link; `/reset-password` accepts a new password and confirmation. Login has a recovery link. Same-origin POST checks apply.
- `POST /api/auth/forgot-password` returns the same 202 message for unknown, inactive, unverified, wrong-realm or throttled accounts. Eligible delivery runs in a bounded background task; failures are logged without recipient, token or provider details. There is no durable retry queue; users can request again. Recovery disabled globally returns a uniform 503.
- Only an active account with an explicitly verified recovery mailbox matching its current login email is eligible. Existing accounts are NOT automatically marked verified. Hosted account realm checks remain enforced.
- Reset tokens use 32 random bytes. Only SHA-256 hashes, environment realm, expiry and password fingerprint are stored. Expiry is 15 minutes. The emailed token is in the URL fragment, absent from HTTP access logs; the UI captures it in memory and clears the fragment. Refreshing that page requires reopening the link. No local/session storage is used. Reset pages send `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
- `POST /api/auth/reset-password` enforces a 16–1024 character password. It locks the credential row, atomically consumes the token, changes the salted password hash, deletes every outstanding reset token and revokes all sessions for that user. Unrelated users, roles, client grants and business documents are unchanged. No automatic login follows reset.
- Login now holds the credential-row lock through session issuance, serializing with password reset so an old-password login cannot mint a surviving session after reset commits. Failed reset transactions roll back token consumption and session/password changes together.
- Request limits are shared in PostgreSQL: three requests per normalized-email hash per hour, 100 globally per hour. Reset attempts: five per token hash and 100 globally per hour. Generic responses hide account existence. These conservative global limits can affect availability under abuse; provider/WAF edge limits and trusted-client-IP configuration remain future hosted work.
- Factory mail is not reused. Signature and Zoho providers are not invoked. Mail tests inject a capture function; no messages leave the QA environment.

## Schema and activation (future explicit authorization only)

Alembic `0005` adds `crm_recovery_emails` and `crm_password_resets`; it does not modify existing accounts. RLS and revoked PUBLIC/anon/authenticated access match existing backend-owned tables. Review grants/policies for the runtime DB role before hosted use. No destructive automatic downgrade is provided.

Recovery is off unless `CRM_RECOVERY_ENABLED=1`. Configure separate server-only values privately:

| Variable | Purpose |
| --- | --- |
| CRM_RECOVERY_ENABLED | Explicit enable switch; default off |
| RECOVERY_SMTP_HOST | Recovery-only SMTP server |
| RECOVERY_SMTP_PORT | STARTTLS port; default 587 |
| RECOVERY_SMTP_USER | Sending account |
| RECOVERY_SMTP_PASSWORD | Mailbox/app password; secret |
| RECOVERY_MAIL_FROM | Approved sender address |

SMTP uses required STARTTLS with certificate verification and a 15-second socket timeout. No settings are read from factory `mail/keys.env`. Actual provider delivery/DNS has not been verified. Future delivery activation requires authorization and a configured mailbox/domain; do not enable it merely to make tests pass.

After a separately authorized destination migration, independently verify ownership of an existing account's email, export the correct environment/realm/database configuration privately, then enroll:

```powershell
.venv/Scripts/python.exe -m backend.recovery_email --email "VERIFIED_ACCOUNT_EMAIL" --confirm-target "HOST/DATABASE" --ownership-verified
```

This attests an operator verification; it is not an automated email-verification challenge. It never changes passwords or roles. New accounts can instead use `backend.provision_user` with `--recovery-email-verified` after the same ownership verification. Hosted provisioning still requires `--confirm-target`. Do not attest unverified mailboxes. Existing local login works without applying these migrations while recovery remains disabled.

## Evidence

Private folder: `.local/recovery-20261021/`.

- `backup/manifest.json`, `backup/database.dump`, `backup/uploads/`: fresh read-only live backup.
- `results.json`, `backend-tests.log`: separate `crm_crud_test_recovery_*` PostgreSQL database, migrations and backend suite; live table and attachment comparisons.
- `recovery-tests-final.log`: additional recovery/enrollment/rollback verification.
- `frontend-tests.log`, `frontend-format-final.log`: auth UI tests and final formatting.
- `assets/`: isolated production auth build, including TypeScript check; running live assets were not replaced.
- `browser-results.json`, `forgot-*.png`, `reset-*.png`: Edge/Chromium at 320, 390, 768 and 1440px; complete mock-mail recovery, mismatch feedback, new login with reader role, replay denial and invalid-link UI.

Live source DB remains at its prior schema; QA databases and evidence were retained. A backup restore was not rehearsed in this task. Real SMTP delivery and cloud behavior are not claimed as verified. Subsequent local MFA verification is documented separately in MFA.md.
