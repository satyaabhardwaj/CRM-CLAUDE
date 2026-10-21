# Hosted identity isolation

Implemented 2026-10-21. Subsequent authorized local activation applied migrations through 0006; cloud activation remains pending. Local activation evidence: `.local/auth-activation-20261021/verification.json`.

## Behaviour

Development keeps the existing users, passwords, sessions and admin/reader/assigned grants. It does not query the new binding tables, so development login does not depend on hosted bindings. Public hosted origins cannot use development mode through Settings.load; Vercel explicitly rejects development mode.

Production/preview require explicit CRM_ENV, a public HTTPS CRM_ORIGIN, and CRM_AUTH_REALM (a unique UUID per environment). Missing or incorrect account bindings deny password authentication and session issuance. Every protected request also requires the matching account AND session binding. An old/copied session without a binding is rejected even if its user has a valid production account binding. Existing roles, grants, cookie flags, session expiry and logout remain unchanged.

Alembic 0004 adds crm_auth_accounts and crm_auth_sessions; it never classifies existing users as production. RLS is enabled and PUBLIC/anon/authenticated access revoked. The future least-privilege backend role needs appropriate access/policies for these two tables. Session bindings cascade on session deletion. Schema changes were first tested in isolated QA and subsequently applied during authorized local activation.

## Future setup, only after authorization

1. Choose a fresh production identity UUID; do not reuse a preview UUID. It is an environment identifier, not a password. Keep it stable after provisioning; changing it intentionally locks out bound accounts/sessions until a reviewed re-provisioning procedure.
2. Apply migrations to the verified destination using the migration role. Do not copy development identities, sessions or bindings. Import only approved business data and files, map approved grants to fresh accounts.
3. Export CRM_ENV=production, CRM_AUTH_REALM, CRM_ORIGIN and the destination DATABASE_URL privately. Production provisioning never loads local env files. It requires an explicit host/database acknowledgement before prompting:

   ```powershell
   .venv/Scripts/python.exe -m backend.provision_user --email "ADMIN_EMAIL_YOU_CONTROL" --role admin --confirm-target "HOST/DATABASE"
   ```

4. Enter a fresh unique password at the hidden prompts. Provisioning adds a new account plus binding; it cannot relabel an existing dev account. No accounts were provisioned against the live database in this task.
5. Verify copied development credentials/cookies are rejected, and each new account has the approved role/grants before exposure.

The binding is enforced by the application, not a defence against an operator deliberately modifying the identity tables or copying an entire production identity database together with its realm configuration. A manually reused demo password for a freshly provisioned production user is not identified by this guard; use a fresh password. Comprehensive password blocklists and auth-version revocation are later work. Subsequent recovery and MFA implementations are documented in ACCOUNT_RECOVERY.md and MFA.md.

## Release/rollback safety

Do not deploy an older backend that omits the hosted checks after production activation. Preserve additive tables and use a reviewed forward fix; the migration refuses automatic destructive downgrade. No reset, table deletion, live user modification or service restart was performed.

Evidence: .local/auth-realm-20261021/results.json and backend-tests.log. Fresh database/attachment backup: .local/auth-realm-20261021/backup-verified. QA schemas/databases are retained; no cleanup/deletion performed. Compare the evidence's live table/attachment hashes with the backup before making any data-preservation claim.
