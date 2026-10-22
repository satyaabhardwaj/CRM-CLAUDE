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
- **What counts as activity:** a change request (`POST`/`PUT`/`DELETE` under `/api/`, except sign-in, sign-out and the login MFA step), `POST /api/auth/activity` (sent by the shell after real keyboard or mouse use), and opening a page. Every `GET /api/...` (store polling, `/api/auth/me`, measurement refresh) never renews. Requests with `X-CRM-Background: 1` never renew either; the two timers that save on their own (OCF auto-sign and the factory-mail result) send it.
- Renewal runs in the request middleware in its own short transaction, before the handler opens its own, so it never contends with the save it accompanies. At most once a minute per session (`last_seen` check in the same `UPDATE`).
- The cookie's `Max-Age` is the absolute maximum (12 h); the server enforces the idle limit.
- `GET /api/auth/me` and `POST /api/auth/activity` return `idle_expires_at` and `expires_at` (Unix seconds).
- Settings `CRM_SESSION_IDLE_MINUTES` (default 240) and `CRM_SESSION_MAX_HOURS` (default 12) are validated at start (idle between 1 minute and the maximum). QA can shorten them.
