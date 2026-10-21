# Final local container verification — 21 October 2026

Latest rebuild and real-data UI verification: [Real-data UI check](REAL_DATA_UI_CHECK.md). This supersedes the image digest in the earlier UI reports below.

Latest local presentation rebuild: [Workspace UI redesign](WORKSPACE_UI_REDESIGN.md) records the current image, navigation/menu changes and fresh verification. Historical image digests below are retained as earlier evidence.

Subsequent presentation-only rebuild: see [UI/UX cleanup](UI_UX_CLEANUP.md) for the newer image digest, UI checks and rollback tag. The image identity below records the earlier pre-cleanup verification; the production setup gates remain applicable.

Local verification is complete for the checks below. Cloud release is not authorized and hosted readiness is not yet verified. Target architecture remains Vercel (React assets + FastAPI) and Supabase (PostgreSQL + private Storage). Vercel uses the source configuration, not this Docker image.

## Verified in this rebuild

- Docker build completed successfully; all six frontends compiled inside the multi-stage build.
- Image `magppie-crm:local-verified`: `sha256:72b0731b306639101d2282a5356f84fb6d0b32c9c342ec7e56e0953cbcb437b6`.
- Only CRM was recreated. Compose waited for healthy status; database-aware runtime health check passed. Supabase services remained running; all services with health checks were healthy.
- Running image matches the rebuilt image. Non-root `crm` user, read-only root filesystem, all capabilities dropped and no-new-privileges confirmed.
- CRM published only on `127.0.0.1:4302` (internal 8000). Supabase published ports remain loopback-only. Native CRM on 4301 is separate.
- Existing admin login succeeded through HTTP and browser. All five authenticated module routes returned HTTP 200.
- All 28 client documents match the pre-audit hash. All 15 attachments were downloaded internally through the rebuilt container's Storage connection and their SHA-256 hashes matched the pre-replacement baseline. Docker volume inventory is unchanged.
- Factory send API returned 403. Signature provider is off. No customer edits, payment approvals or outbound factory emails were performed.
- Browser navigation rendered Sales, Accounts, Design and Management. At 390px Sales team cards use one readable column; at 320px Management navigation is 296px wide. Accounts and Design fit 320px without document overflow.
- Measurement live Zoho synchronization completed in the rebuilt container: 7,959 orders scanned and 118 requests displayed (95 open, 23 done). This verifies a local integration run; hosted cold-start/time-limit behavior remains unverified.

Earlier local workflow verification: 183 frontend tests, 30 backend tests, six formatting checks and six production builds passed. These test suites were run before this image rebuild, not rerun as part of it. The rebuild compiled the same source again. See [workflow evidence](LOCAL_WORKFLOW_VERIFICATION.md) for synthetic write workflows, authorization, payment calculations, failure states and the 20-case responsive matrix.

Earlier local backup/restore rehearsal evidence is in [Supabase verification](VERCEL_SUPABASE_VERIFICATION.md). This rebuild preserved those backups; it did not create a new coordinated backup. A fresh backup with writes paused is required at cutover.

## Your setup before cloud release

- [ ] Confirm owned Vercel team and Supabase account access, project names, region and acceptable plan/budget. No services have been purchased by this task.
- [ ] Choose production domain and provide DNS access, or approve the initial provider domain.
- [ ] Choose production admin identity and unique password; provide teammate identities and their roles/client access. Enter secrets privately, never in chat or committed source. Do not reuse the development dummy login in production.
- [ ] Configure production database, Storage and Zoho secrets through private provider environment settings using `.env.production.example`. Runtime and migration database credentials must be separate; service-role keys stay server-only.
- [ ] Confirm which existing records belong in production and a cutover window. No sample-looking records will be removed automatically.
- [ ] Agree on backup retention, recovery objectives, responsible owner and alert recipient. Keep encrypted off-machine backups.
- [ ] Explicitly authorize cloud setup/deployment in a later request.

## Engineering release gates after authorization

- [ ] Configure production HTTPS origin, secure cookies, least-privilege database access and private Storage policies; no development internal URLs.
- [ ] Run reviewed Alembic migrations and Storage migrations separately from build/start. Import only into a verified destination; preserve source data and reconcile counts/hashes.
- [ ] Create production users/grants, invalidate development sessions in the destination and verify each role's allowed and denied operations. Decide and implement required account recovery/MFA before release.
- [ ] Verify Vercel runtime compatibility, cold starts, Zoho synchronization duration, payload limits, multi-instance concurrency and rate limits on the actual hosted target.
- [ ] Configure monitoring, alerts and scheduled backups; rehearse restore into a separate destination.
- [ ] Run hosted login, all five workflows, private upload/download, calculations, role denials and factory-email-block smoke checks.
- [ ] Run image OS vulnerability scan if distributing the container. Prior dependency audit evidence does not replace an OS-layer scan.
- [ ] Test physical mobile devices and additional browser engines as required. Current browser evidence is Chromium viewport emulation.

Factory emails must remain disabled throughout deployment unless separately authorized. Local results do not establish production readiness or guarantee zero defects.

## Repeat the local container run

From the repository root, start `Start CRM.cmd` for Docker/local Supabase, then:

```powershell
.venv/Scripts/python.exe scripts/prepare_container_local.py --port 4302
docker compose --env-file .local/compose.env -f docker-compose.yml -f deploy/compose.local.yml up -d --build --wait
```

Open `http://127.0.0.1:4302/login`. Keep `.local/container.env` and `.local/compose.env` private. See [container runbook](../deploy/README.md) for port contracts and backup commands.

## Local app rollback

The previous image is retained as `magppie-crm:before-mobile-fixes-20261021`. To restore that app image only, in a fresh PowerShell session:

```powershell
$env:CRM_IMAGE = 'magppie-crm:before-mobile-fixes-20261021'
docker compose --env-file .local/compose.env -f docker-compose.yml -f deploy/compose.local.yml up -d --no-build --wait crm
Remove-Item Env:CRM_IMAGE
```

Then verify health, login and private downloads. This does not roll back database data. Never use `down --volumes`, `docker volume prune` or `supabase db reset`. Database recovery means restoring to a separate database, validating it and explicitly switching connections; never overwriting the active database as an automatic rollback.

No files or data were deleted in this rebuild. No cloud deployment or cloud project changes were made.
