# Historical reports

These are dated working notes, module migration reports and verification evidence from 19–21 October 2026. They are kept for audit and reference. They describe the state at the time they were written, so file paths, ports, test counts and rollback steps may be out of date. For example, the `legacy.html` entries and the 4300 server are now on branch `archive/legacy-2026-10`.

The current documents are:

- [ARCHITECTURE](../ARCHITECTURE.md)
- [SETUP](../SETUP.md)
- [DEPLOYMENT](../DEPLOYMENT.md)
- [OPERATIONS](../OPERATIONS.md)
- [SECURITY](../SECURITY.md)
- [PRODUCTION_SECRETS](../PRODUCTION_SECRETS.md)
- [FINAL_DEPLOYMENT_CHECKLIST](../FINAL_DEPLOYMENT_CHECKLIST.md)
- [CHANGELOG](../../CHANGELOG.md)

| File | What it records |
|---|---|
| VERCEL_SUPABASE.md | Original Vercel + Supabase foundation and local cutover runbook (now split into SETUP and DEPLOYMENT) |
| VERCEL_SUPABASE_VERIFICATION.md | 21 Oct local Supabase cutover evidence |
| AUTH_REALMS.md, MFA.md, ACCOUNT_RECOVERY.md | Implementation notes and evidence (current behaviour is summarized in SECURITY) |
| SALES/DESIGN/ACCOUNTS/MEASUREMENT/MANAGEMENT_REACT.md | Per-module React migration, tests and the old legacy.html rollback path |
| MIGRATION_AUDIT.md | Whole-CRM migration audit and remaining service dependencies |
| PREDEPLOYMENT_AUDIT.md, STAGING.md | Earlier container/staging preparation |
| PROJECT_STRUCTURE.md | Folder tree as of 21 Oct (before the legacy archive) |
| LOCAL_WORKFLOW_VERIFICATION.md, REAL_DATA_UI_CHECK.md, MOBILE_FINAL_CHECK.md, VERIFICATION.md | UI and workflow verification runs |
| UI_UX_CLEANUP.md, WORKSPACE_UI_REDESIGN.md, CLEANUP_REVIEW.md | UI redesign and cleanup reviews |
