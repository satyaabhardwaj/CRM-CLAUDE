# Changelog

All notable changes to the Magppie CRM. Dates are 2026.

## Unreleased

### Sign-in code by email (23 Oct, branch feature/email-otp)
- After the password, accounts with a verified mailbox and no authenticator app get a six-digit code by email (`info@mymagppie.com` first) and enter it to finish signing in. On with `CRM_EMAIL_OTP=1` and the reset-link mail settings.
- The code works once for 10 minutes, 5 wrong tries end it, "Send a new code" after 30 seconds (three times). Only hashes are stored (migration 0010); sign-out or a password change cancels a pending code; if mail fails nobody is signed in.
- `scripts/set_recovery_mail.py` now turns on both reset emails and sign-in codes after a successful test email (`--no-login-codes` for reset emails only).
- Tests: `backend/tests/test_email_codes.py` (8), `backend/react/tests/email-code.test.tsx` (3).
- **Mail on any network:** the CRM's emails (sign-in codes, reset links) go through the Gmail API over HTTPS when set up with `scripts/set_gmail_api.py`, with SMTP as the fallback. The office network blocks port 587, so SMTP alone failed there. Tests: `backend/tests/test_mail_transport.py` (7).

### Sign-in, sessions, department roles and user management (22–23 Oct, branch feature/auth-real-use)
- **Sliding sessions:** sign-out after 4 hours without real use and at most 12 hours after sign-in (`CRM_SESSION_IDLE_MINUTES`, `CRM_SESSION_MAX_HOURS`); background polling never keeps a session alive. A "Stay signed in" dialog warns two minutes before. Migration 0007.
- **No lost work:** when a session ends, unsaved client changes are kept in the tab and saved once after signing in again; sign-in returns to the same page (`next`, same-site paths only).
- **Department roles:** sales, design, measurement and accounts edit their own department and view the rest; reader views everything; only accounts and admin give the four Accounts approvals. Enforced on every save by `backend/permissions.py` (403, nothing saved). Screens show a "View only" pill. Migration 0008.
- **Users page** (Management, administrators with an authenticator) and `python -m backend.users`: add with a one-time temporary password, change role, deactivate, reactivate, reset password (forces a new password). The last administrator is protected; nobody is deleted; every action is audited. Migration 0009.
- **Passwords:** one rule, 12–1024 characters, everywhere.
- **Laptop first-run admin:** a random password shown once (no fixed password in the repository), changed at first sign-in.
- **QA server:** one synthetic user per role and `--idle-minutes` / `--max-hours`.
- Decisions and evidence: [history/AUTH_REAL_USE.md](docs/history/AUTH_REAL_USE.md).

### Local admin for a fresh clone (22 Oct)
- On a laptop (development database on localhost, localhost address), the CRM now starts a fresh clone by itself: an empty workspace if there is none, and the admin `admin@magppie.local` with the starting password `Admin@1234` if that email is missing. Existing workspaces and accounts are never changed. `CRM_LOCAL_ADMIN_PASSWORD` overrides the password; `CRM_LOCAL_ADMIN=0` turns it off. It never runs on preview, production or Vercel. (The fixed password was replaced on 23 Oct by a random one shown once; see above.)
- `python -m backend.local_admin` resets that admin (or creates another) with a password of at least 8 characters typed at a hidden prompt.
- Tests: `backend/tests/test_local_admin.py` (10), plus a fresh-clone run on a throwaway database (migrate, start, sign in, Sales opens). See [SETUP](docs/SETUP.md).

## v1.0-rc6 (22 Oct, 6e42372)
Change password, the sign-in Show button fix and the cloud readiness pack, merged to `main` from PR #1. Local image `magppie-crm:rc6-6e42372`; see [FINAL_DEPLOYMENT_CHECKLIST](docs/FINAL_DEPLOYMENT_CHECKLIST.md).

### Sign-in Show button and formatting fixes (22 Oct)
- The Show/Hide button sits inside the sign-in password box again. The change-password section had reused the sign-in form's `auth-password` class; it is now `auth-change-password` (5f8c1c1).
- Prettier formatting for the change-password files, so `format:check` passes in CI (ae0b2a5).

### Change password from Account security (22 Oct)
- New "Change password" section on `/security`, backed by `POST /api/auth/password`.
- It needs the current password, and a code when an authenticator is enabled. Unenrolled admins must enrol first.
- Other sessions, open reset links and pending sign-in challenges end; this session stays signed in. The change is audited as `auth.password_changed`.
- Tests: `backend/tests/test_password_change.py` (8) and `backend/react/tests/password.test.tsx` (4). See [SECURITY](docs/SECURITY.md#changing-your-password).
- Fixed a garbled folder path in `docs/PRODUCTION_SECRETS.md`.

### Phase 7: cloud readiness pack (22 Oct, documentation only)
- `docs/DEPLOYMENT.md` rewritten as the readiness pack. It covers:
  - environments, and the variables per environment (names only);
  - the migration order and the runtime-role command;
  - the Gate B and Gate C step lists;
  - a cutover runbook with rollback;
  - the backup schedule, monitoring and alerts;
  - the decisions still open.
- No cloud resource was created or changed.

## v1.0-rc5 (22 Oct, df57e00)
UI polish: design system, one shared app shell, components on every screen, smooth refresh, and full verification. See the Phase 1–6 entries below.

### UI polish, Phase 6: verification (22 Oct)
- **New checks:**
  - `npm run ui:a11y`: accessible names, landmarks, a keyboard Tab walk, and Escape for the drawer, bell and user menu.
  - `npm run ui:visual`: 12 screenshot baselines on synthetic data with a frozen clock, committed in `tests/ui/visual/baselines`.
  - The layout audit also covers zoom 200% and Windows 125%/150% (`--widths zoom200,win125,win150,laptop125`).
- **Fixes:**
  - the Sales bell closes on Escape;
  - Accounts and Measurement tab badges keep their place while counts load, so the tabs no longer move.
- **New docs:** `docs/UI_GUIDE.md` (tokens, breakpoints, shell and component rules, real-phone checklist), and an ARCHITECTURE UI section.
- **Results:** in FINAL_DEPLOYMENT_CHECKLIST ("UI polish regression").

### UI polish, Phase 5: smooth and fast (22 Oct)
- **Background refresh changes nothing on screen when nothing changed.**
  - Accounts, Management and the Measurement bell now skip the update when the saved revision is the same, as Sales and Design already did.
  - Management's poll no longer flips a loading state, and the Measurement bell stops polling while the tab is hidden.
  - The existing "busy" pause while typing or with a menu open is unchanged.
- **Stable row keys:** Sales approvals and Design lists use client + kind instead of list position.
- **Inline saving feedback:** the field just changed shows Saving… / Saved / Not saved on its label line (Sales and Design). It reads the stores' existing status, and the save logic is unchanged. A plain "Changes saved" toast fades after 3 s.
- **Micro-interactions (150–200 ms):** button press, content fade after the skeleton, window rise, drawer and panel slide, tab indicator. None run under `prefers-reduced-motion`.
- **Long lists (500+ rows), measured instead of virtualised:**
  - A background refresh causes no style or layout work, because unchanged rows produce no DOM changes.
  - On desktop the longest task is 163 ms (Architects, 520 editable rows).
  - CSS virtualisation (`content-visibility`) was tried and reverted, because estimated row heights made the page jump on refresh.
  - JS windowing for the Architects editor stays an option if real phones feel slow.
- **Lazy loading:** Measurement Reports is its own chunk (3 KB), like the map. Every module's initial bundle is within +2.2% of the pre-polish size.

### UI polish, Phase 4: components on every screen (22 Oct)
- **Shared component CSS:** `shared/look.css` is one tokenised component layer, with the old "calmer colours" overrides folded in.
- **Touch sizes** (`--tap`): buttons, fields, list rows, steps and map controls are 44 px on touch screens and below 1024. With a mouse they are 40 px (32 px for small).
- **Buttons:**
  - one set: default, dark, line, warn, small and round;
  - a busy button keeps its width (`StableLabel`: Upload, Refresh, Save payment).
- **Chips:** one system, with status pills and priority tags sharing size and semantic colours.
- **Tables:**
  - numeric columns are right-aligned, and rows have a fixed minimum height;
  - below 768 the Sales lists, Accounts tables, Management people and client tables, and the Design board and tracker become labelled cards (`cardify`, `useCardLabels`);
  - master data stays a sideways-scrolling table, so all of its 40 columns stay reachable.
- **Tooltips:** any text cut off with "…" shows its full text on hover (`useAutoTitle`, everywhere).
- **Windows (dialogs):**
  - full-screen sheets on phones, with a sticky close bar;
  - the page behind does not scroll;
  - native focus trap, and focus returns to the opener.
- **Bell panel:** stays inside the screen at every width.
- **"Also today":** below 1280 it is a side panel with a backdrop, a close button and Escape; focus moves in and comes back.
- **Saving, saved, read-only and error notices:** one toast position (top on phones, bottom-left on desktop), so they no longer push the page.
- **Loading:** skeletons in the shape of each module's first screen. Empty states have one centred style.
- **Fixes:**
  - Design's list rows no longer render as unstyled native buttons;
  - the Accounts Summary no longer overflows on phones.

### UI polish, Phase 3: design system and app shell (22 Oct)
- **Tokens** (`shared/tokens.css`): spacing, type scale with fixed line heights, weights, radius, shadows, control heights, a z-index scale, motion and semantic colours. The old names stay as aliases.
- **One breakpoint set everywhere: 640 / 768 / 1024 / 1280.** It replaces 600/700/1000/1100/1200 in CSS and the 700 px JavaScript query.
- **No more squeezed lists.** Below 1024 the page scrolls as one document and lists take their natural height. From 1024 the main column scrolls and lists keep at least 320 px. This fixes the phone and landscape lists that collapsed to 0–48 px.
- **One header for all five modules** (`backend/react/src/Shell.tsx`):
  - fixed height, and the logo and department tabs sit in the same place in every module;
  - the active tab has an underline indicator, with no weight change;
  - search collapses to an icon below 1280;
  - New opportunity floats on phones;
  - the user menu is last in the keyboard order;
  - "Tavneet" is now **Management**; the Person selector stays in the Management toolbar.
- **Sidebar:**
  - below 1024 it is a drawer opened from the header, with Escape, swipe and backdrop to close, and focus returns to the menu button;
  - fixed 248 px on desktop, collapsing to 64 px icons;
  - right-aligned counts, and no bold on the active item.
  - Design keeps its sidebar on My tasks, so the content no longer jumps.
- **Stage and view tabs** share the department tab style. The status bars, filter toolbar and page header follow one pattern.
- **CSS clean-up:**
  - `!important` 23 → 0, duplicated selectors 63 → 0;
  - every z-index is a token, and `scrollbar-gutter: stable` is set on every scroller;
  - the dead workflow-panel CSS is removed.
- Presentation only: no API, data, save, permission, auth or calculation change.

### UI polish, Phase 2: layout audit (22 Oct, read-only)
- New `tests/ui/layout-audit` (`npm run ui:audit`): Playwright visits every screen and state at 10 widths on synthetic data. It reports page overflow, overlaps, obscured or off-screen controls, clipped text, squeezed scroll areas, touch targets under 44 px, CLS (load, refresh, tab switch), and focus or scroll lost after a background refresh. `npm run ui:css-map` lists breakpoints, `!important`, hard-coded values and duplicate selectors.
- `scripts/serve_workflow_qa.py` takes `--dataset stress|one|empty` and `--port`; the default is unchanged.
- No app code changed. The audit report is private (`.local/ui-polish/AUDIT.md`).

### UI polish, Phase 1: move and local start (22 Oct)
- The project now runs from `C:\Users\am600\Projects\CRM-CLAUDE` (moved out of OneDrive). No tracked file points at the old path.
- New **Stop CRM.cmd** (`scripts/stop_local.py`): stops only this folder's CRM server, then `supabase stop` with data kept.
- The launcher redacts Supabase keys and database passwords before writing `.local/launcher.log`.
- The backend runner no longer logs a traceback when a browser drops a connection on Windows (WinError 10054).
- `Start CRM.cmd` points at `docs/SETUP.md`; SETUP has the daily start/stop steps and "do not update the Supabase CLI".
- `.claude/` is ignored. `@playwright/test` 1.64.0 added for the UI audit.
- Gate 1 cleanup (approved): the Zoho read keys now come from `C:\Users\am600\Magppie-Keys\crm-measurement-zoho.env`. Removed: the stale `C:\Projects\CRM-CLAUDE` copy (rc2), the retired-cluster `backend-local.json`, key lines in the old launcher log, 235 old `.local` evidence items, old CRM/Supabase images, QA containers, the old `magppie-crm-local` volumes and the build cache. Live data unchanged.

### Phase 7: preview preparation (22 Oct)
- New operator command `backend.runtime_role`: a least-privilege runtime role (`crm_app`), with read/write on the CRM tables and a role-scoped RLS policy only. It has no DDL, no BYPASSRLS and no Supabase API roles, and it is idempotent. The password is sent to the server only as a SCRAM verifier. The command verifies itself and is tested against a real PostgreSQL role.

## v1.0-rc3 (22 Oct)

### Phase 6: regression (22 Oct)
- Full regression passed: frontends 212 tests; backend 124 (including real Storage); CRUD/roles 28; container smoke 121/121; 40 viewport views; secret scan clean. Details are in FINAL_DEPLOYMENT_CHECKLIST.

### Phase 2: cleanup (21 Oct, Gate A)
- Archived retired code on branch `archive/legacy-2026-10` and removed it from `main`:
  - `online/`, `vercel/`, `windows-helper/`, `deploy/staging/`;
  - the 4300 launchers `run.cmd`, `run.sh`, `measurement/server.py` and `measurement/start.cmd`;
  - `test/`, `pre-sales/`, `post-sales/`, the tracked `backup/` code snapshots and the five `legacy.html` entries.
  `core/` and `shared/kit.js` stay, because they are still imported or tested.
- Moved 18 older backups, the old `data/` folder, the pre-Supabase cluster and the migration uploads into one AES-256 archive outside OneDrive. All 3,923 files were verified before the originals were removed.
- Dropped the QA databases, 85 synthetic `test_*` schemas found inside the live database, and the QA bucket. Live data was unchanged.
- Removed the merged remote branch `satya_end_changes`.

### Phase 3: restore (21 Oct)
- Added `scripts/restore_postgres.py`, a one-command restore into a new, empty database only, optionally with a new private bucket. It refuses the live database or bucket, non-empty targets and tampered backups.
- Fixed the duplicate `public` schema restore failure by restoring through a filtered `pg_restore` list.
- Restores now re-apply RLS and revoke PUBLIC/anon/authenticated access.
- `backup_postgres.py --restore-check` now uses the same path.
- `backend/tests/test_api.py` now refuses any database that is not a local `crm_crud_test_*` one.
- Rehearsed: 15 tables, 28 clients and 15 attachments matched.

### Phase 4: docs (22 Oct)
- Consolidated the docs into ARCHITECTURE, SETUP, DEPLOYMENT, OPERATIONS and SECURITY, plus this changelog.
- Moved older reports to `docs/history/`.
- Start instructions now point to `Start CRM.cmd` / 4301, and port 4300 is marked retired. The business rules in CLAUDE.md are unchanged.

### Phase 5: product finishing (22 Oct)
- MFA policy: admins must use an authenticator; reader and assigned stay optional.
  - It is enforced on the server: an unenrolled admin gets a 403 `mfa_enrollment_required` response from every data API, and pages redirect to `/security`.
  - Admins cannot disable MFA.
  - Hosted environments fail closed without the MFA key.
- Account security page explains the requirement, and the session script sends a blocked admin to `/security`.
- New operator command `backend.reset_mfa` for identity-verified lost-factor recovery (owner Satya Bhardwaj), documented in SECURITY.
- No logo change and no business-rule change (as decided).

## v1.0-rc2 (21 Oct, 7469f56)
- Hosted identity isolation: environment realm UUID, account and session bindings (Alembic 0004).
- Password recovery by email, off by default (0005).
- Authenticator MFA with recovery codes, opt-in (0006). Logout also revokes pending MFA challenges.
- Account security page and account menu; Quiet Graphite sign-in, recovery and MFA screens.
- Reader permissions enforced in every module; archived architects preserved.
- CI aligned to an isolated `crm_crud_test_ci` database, with consistent line endings.
- Deployment-readiness docs, and a local restore rehearsal: 15 tables and 15 attachment hashes matched.

## v1.0-rc1 (21 Oct, 78d14b1)
- FastAPI backend with local admin login, PostgreSQL (Alembic 0001–0003) and local Supabase PostgreSQL + private Storage. All 28 clients and 15 attachments were reconciled at cutover.
- Sales, Design, Accounts, Measurement and Management migrated to React 19 + TypeScript, plus a React login.
- Unified responsive layouts, navigation and user menus.
- One-click `Start CRM.cmd`, a multi-stage Docker image, CI on Ubuntu and Windows, and future Vercel configuration with Git auto-deploy disabled.
- Regression suites and isolated CRUD verification. Factory email disabled (403), signatures off, Zoho read-only.
