# Authenticator MFA

Implemented and tested on isolated QA only, 2026-10-21. No live database migration, enrollment, encryption-key configuration, service replacement, cloud deployment or outbound provider call occurred.

## User flow

Avatar menu -> Account security (`/security`) -> enter current password -> add the displayed setup key as a time-based account in an authenticator app -> enter the six-digit code -> save ten recovery codes privately -> sign in again.

The setup UI supports manual entry and an `otpauth://` deep link. No third-party QR service receives the seed. Automatic QR rendering is not included. Mobile browser tests verify the UI and algorithm; a physical authenticator app/device was not paired during this task.

For enrolled accounts, email/password authentication returns a restricted five-minute HttpOnly, SameSite=Strict challenge cookie. It is not a CRM session and cannot access the APIs. After authenticator/recovery-code verification, the server issues the existing one-hour CRM cookie. HTTPS keeps both cookies Secure. Existing non-enrolled accounts retain their current login. Roles and client grants are unchanged.

Enrollment is opt-in for all current roles; mandatory-admin/all-user policy is not silently imposed. Choose that rollout policy separately before production activation.

## Implementation

- `backend/mfa.py`: RFC 6238 TOTP (SHA-1, six digits, 30 seconds), +/- one step clock tolerance, monotonic last-used counter to reject replay. Six published RFC eight-digit vectors are checked against the same implementation.
- Seeds are random 160-bit values stored with authenticated Fernet encryption. The key is server-only; decrypted setup seed is returned only after authenticated password re-verification for a pending enrollment. Pending enrollment expires in ten minutes. Existing enabled factors cannot be overwritten by setup.
- Ten 128-bit random recovery codes are displayed once. Only SHA-256 hashes are stored. Consumption uses transactional DELETE ... RETURNING under a per-user credential lock; concurrent reuse has one winner. Codes are not put in browser storage or logs.
- Enrollment confirmation, factor disable and recovery-code replacement require the current password. Disable/replacement also require a fresh authenticator code or unused recovery code. Those actions revoke all that user's sessions and pending challenges; replacing codes invalidates the previous set.
- Challenges bind user, realm, password fingerprint and encrypted factor fingerprint, expire in five minutes and allow at most five failed attempts. Shared PostgreSQL rate limits cap verification at ten attempts per user/hour and 100 globally/hour, and management separately at the same limits. These conservative global limits can affect availability under abuse; trusted edge/IP controls remain a hosted release concern.
- Credential-row locking serializes login, setup, factor verification, disable, reset and code consumption. A password reset invalidates pending challenges through its changed fingerprint; it does not disable MFA or regenerate recovery codes. Missing encryption key never downgrades an enrolled account to password-only access. A bad key/ciphertext returns a safe error, not a session.
- Status is authenticated and returns only availability, enabled state and remaining code count. Existing CSRF/origin checks, permission checks, login limits and session cookies remain in force.

Endpoints: `GET /api/auth/mfa`; `POST /api/auth/mfa/setup`, `/confirm`, `/verify`, `/recovery-codes`, `/disable`. The existing `/api/auth/login` returns HTTP 202 plus `mfa_required: true` for enrolled users; the native login UI handles the second step. Successful non-MFA login remains unchanged.

Alembic `0006` adds `crm_mfa`, `crm_mfa_codes`, `crm_mfa_challenges` with RLS and PUBLIC/anon/authenticated access revoked. It does not enroll users or alter business documents. Hosted runtime-role grants/policies must explicitly cover these tables. The current unmigrated local database is supported when the key is unset: existing password login continues without MFA-table queries during authentication. Configuring a key before the schema exists fails startup.

## Future activation (requires authorization)

1. Back up the destination database, verify its identity, apply reviewed migrations through `0006` with the migration role. Never run them automatically on startup.
2. Generate a unique Fernet key for that environment using `cryptography.fernet.Fernet.generate_key()` in a trusted private process. Store directly in a secret manager, not source, browser variables, screenshots or chat. Set `CRM_MFA_ENCRYPTION_KEY` for the server only. The production example leaves it empty deliberately.
3. Preserve the key across restarts and back it up securely separately from database dumps. A lost key blocks authenticator verification. Do not replace it with a newly generated key on each boot.
4. Review HTTPS/origin, environment realm, runtime grants and clock synchronization. Enroll users individually, verifying their app codes before activation and storing recovery codes privately.
5. Test login, each role's denials, recovery-code replay and password reset on the authorized destination before exposure.

Rotation requires a separately reviewed decrypt/re-encrypt migration or controlled user re-enrollment; a dual-key rotation tool is not included. Do not change the environment key blindly. Do not roll back to an older backend that bypasses enrolled MFA. Keep additive tables; the migration refuses an automatic destructive downgrade.

If both the authenticator and recovery codes are lost, password reset alone cannot regain access. An identity-verified operator recovery procedure is still needed; no shared bypass password or automatic MFA-removal endpoint is supplied. Factory emails, signatures and Zoho writes remain disabled/uninvoked throughout these checks.

## Verification and evidence

Private evidence directory: `.local/mfa-20261021/`.

- Fresh live backup: `backup/` (database dump and 15 attachment copies).
- `results.json`, `backend-tests.log`: isolated `crm_crud_test_mfa_*` PostgreSQL DB, migrations, full backend tests, live table/attachment hash comparison.
- `mfa-tests-final.log`: focused MFA tests including expired setup, CSRF, encryption failure and duplicate/replayed factor checks.
- `frontend-tests.log`, `frontend-format.log`, `frontend-build.log`, module test/build logs: six frontends, isolated compiled assets; running assets were not replaced.
- `browser-results.json`: admin and reader, five MFA screens at four viewport widths (40 checks), enrollment, revoked pre-MFA session, restricted challenge, invalid code, TOTP login, recovery login and replay denial. Screenshots include synthetic secrets/codes; keep this directory private.

The opt-in real Storage write test is intentionally skipped. Dependency check passed; an existing Starlette/httpx test-client deprecation warning remains. No physical-device or hosted-provider verification is claimed.

References: [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238), [Fernet documentation](https://cryptography.io/en/stable/fernet/).

## Logout regression follow-up

Logout revokes the presented pending MFA challenge and full session in one transaction,
then clears both cookies. Challenge revocation uses the credential lock order shared
with verification and password reset; missing cookies and pre-MFA schemas remain safe.
A copied revoked challenge cannot be reused with an otherwise valid recovery code.

Isolated PostgreSQL regression: 102 passed, one optional Storage test skipped.
Rebuilt Docker image security checks: 90 passed across admin, reader, assigned-read
and assigned-write users. Fresh login still works after logout, and rejected replay
does not consume a recovery code. Private evidence and backup are retained under
`.local/mfa-logout-fix-20261021/`. Live table fingerprints and all 15 attachment hashes
remained unchanged (28 clients). The rebuilt image was tested only against QA; no
live activation or cloud deployment occurred.
