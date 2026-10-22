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
