# Auth for real use (branch feature/auth-real-use, 22 Oct 2026)

Production-ready sign-in, sessions, department roles and user management for the internal CRM. Owner decisions are in the task; the choices made while building it are under "Decisions taken".

## Baseline (main at c2eebf1, before any change)

| Check | Result |
|---|---|
| Frontend tests | auth 46, sales 46, design 47, accounts 26, measurement 18, management 39 (222) |
| Backend pytest (throwaway `crm_crud_test_qa_*` PostgreSQL, dropped) | 137 passed, 1 skipped (real-Storage test) |
| `scripts/check.py` | pass |
| `npm run ui:audit` | Last full run (rc5/rc6 UI, see FINAL_DEPLOYMENT_CHECKLIST): 0 page overflow, overlaps, clipped text; only finding the 30 px map pins. Not re-run on main because the audit builds from the working tree; Phase 8 runs it on the branch. |

## Decisions taken

### Phase 1: sliding sessions
- `crm_sessions` gains `created` (sign-in time) and `last_seen` (migration 0007, additive). `expires` stays the single check on every request: it is the idle expiry and is never moved past `created + CRM_SESSION_MAX_HOURS`, so the request path needs no new condition.
- Existing sessions are backfilled as signed in at `expires - 3600` (they were all one-hour sessions).
- **What counts as activity:** a change request (`POST`/`PUT`/`DELETE` under `/api/`, except sign-in, sign-out and the login MFA step), `POST /api/auth/activity` (sent by the shell after real keyboard or mouse use), and opening a page. Every `GET /api/...` (store polling, `/api/auth/me`, measurement refresh) never renews. Requests with `X-CRM-Background: 1` never renew either (for timers that save on their own; see below).
- Renewal runs in the request middleware in its own short transaction, before the handler opens its own, so it never contends with the save it accompanies. At most once a minute per session (`last_seen` check in the same `UPDATE`).
- The cookie's `Max-Age` is the absolute maximum (12 h); the server enforces the idle limit.
- `GET /api/auth/me` and `POST /api/auth/activity` return `idle_expires_at` and `expires_at` (Unix seconds).
- Settings `CRM_SESSION_IDLE_MINUTES` (default 240) and `CRM_SESSION_MAX_HOURS` (default 12) are validated at start (idle between 1 minute and the maximum). QA can shorten them.
- Background saves were reviewed: OCF auto-sign saves once per newly booked client, and the factory-mail result is saved seconds after the person clicks Approve. Both follow a real action, so they are not tagged; the server still honours `X-CRM-Background: 1` for any future timer.

### Phase 2: never lose work on session end
- One shared helper, `shared/session.ts`, used by the auth shell and every module: `safeNext`, `loginUrl`, `sessionEnded`, drafts (`keepDrafts` / `readDrafts` / `clearDrafts`) and `replay`.
- **What is kept:** the changed client records (and, in Sales, changed shared lists such as architects, under `@<key>`), as `{before, after}` per user + module + client in this tab's `sessionStorage`. No cookie, password or token is stored. Text still being typed in a box is not a change yet (boxes save on leaving or Enter, unchanged), so it is not kept.
- **Accounts** saves through a mutate function, so a save cut off on its first read rebuilds the change from the saved copy on screen; a save cut off on the write carries the changed client in the error.
- **After sign-in** the module replays the drafts once on the newest copy: a record still equal to its `before` gets the change and one save; a record changed by someone else meanwhile is not overwritten, and the person is told which client to redo. Drafts are cleared after that attempt, after any successful save, and on sign-out.
- Measurement and Management have nothing to keep (Measurement only marks its bell as read; Management never saves); they go to sign-in and come back.
- The fetch wrapper waits 150 ms before going to sign-in so the module can keep its draft first. The sign-in page says "Session ended — sign in again. Unsaved changes are kept and saved after you sign in." and returns to `next` after the password (and the MFA step).
- **`next` rule:** only a same-site path: one leading `/`, no `//`, no scheme, no backslash, no control characters, checked again after decoding up to three times (so `%2F%2F`, `%5C` and double-encoding are refused), at most 2,000 characters. Anything else goes to `/`.
- **"Stay signed in" dialog** (`backend/react/src/SessionGuard.tsx`, mounted in `#session-root` on every module page): a native modal `<dialog role="alertdialog">` with focus on the main button; Escape dismisses until the next deadline. Two minutes before the idle limit it offers "Stay signed in" (one activity ping) and "Sign out". Near the 12-hour limit it explains the limit and offers no extension. Times come from the server (`now` in the response), so a wrong laptop clock does not shift the warning. Before warning and at the deadline it re-reads `/api/auth/me`, so activity in another tab is respected. Keyboard or pointer use pings at most once a minute.

### Phase 3: department roles on the server
- Roles `sales`, `design`, `measurement`, `accounts` join `admin`, `reader`, `assigned` (migration 0008 replaces the `crm_users_role_check` constraint; the model now names it). `provision_user` and `manage.py` accept the new roles.
- The permission map lives in `backend/permissions.py` and is documented in docs/SECURITY.md. It was derived from what each module's code actually writes (a scan of every client field assignment in `sales`, `design`, `accounts`, `measurement` React sources plus `shared/rules.js`).
- **Sales owns everything on a client except what other departments own.** Its forms edit most of the record through generic field boxes, so an allow-list would refuse ordinary Sales work. The other departments get explicit allow-lists. Fields shared by more than one department get rules on the value: receipts (Sales requests, Accounts confirms or decides), booking approval (Sales "Pending", Accounts "Approved"/"Rejected"), stage (Accounts only "booked"), the activity log (add on top only).
- **Defaults are not edits.** Saves carry the defaults that `L.ensure` / `L.flow` fill in. The server fills the same defaults into the stored copy (`with_defaults`), taking time-stamped fills from the incoming record. A parity test runs the real `shared/rules.js` in Node on legacy shapes; a read-only run on the 28 live clients (in memory, nothing written) matched all of them. The legacy gates back-fill is accepted only on a record that has no `gates` at all, so it cannot be used to forge an approval.
- **Measurement** writes nothing on clients today (its screens only mark the bell). The role owns the whole `measurement` record so its visit date, assignee and "done" can be recorded when those screens are added; Design shares it, Sales may only create the first request and set its date (what its form does today).
- The check runs after the compare-and-swap on `rev`, inside the same transaction, so a refusal rolls back and the revision is not used up; the existing stale (409) merge flow is unchanged.
- `repository.allowed` lets departments read every client and attach files to any (the record change is checked on save). External actions: OCF signing, voice notes and scratch uploads for `sales` and `admin` (Sales' order forms use them); factory mail (still always refused) for `accounts`, `design`, `admin`.
- `PUT /api/clients/{id}` applies the same per-field rules for departments; `assigned` keeps its grants unchanged.

### Phase 4: the screens reflect the role
- One helper, `canEdit(role, module)` in `shared/session.ts` (admin or the module's own department), and `ROLE_LABEL` for display. Sales, Design and Accounts decide "can save" from it instead of "admin only"; Measurement uses it for its bell.
- A view-only module uses the existing read-only presentation (disabled fieldsets and buttons) and shows a quiet grey "View only" pill in the header (`AppHeader viewOnly`); the header's main action (for example New opportunity) is hidden. The old full-width "Read-only access. Changes require an administrator." line is replaced by the pill. A blocked change says "View only: your role cannot change Sales." (or Design).
- Accounts: payment, decision and the four approval buttons follow `writable`, which is true only for accounts and admin. The pill waits until the role is known, so it does not flash.
- Measurement marks its bell as read only for measurement and admin; other roles see the bell without saving.
- Management is view-only for everyone already and shows no pill.
- The account menu shows the role by name (Administrator, Sales, …, View only, Assigned clients).
