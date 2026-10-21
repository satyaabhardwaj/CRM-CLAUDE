# Measurement — live Zoho CRM

The Measurement section now reads real Orders from Zoho using the adapter mappings supplied in the dashboard ZIP. The screenshot-based CRM layout remains in place. Sales, Design, Accounts and the local client store remain separate.

## React frontend

The active `/measurement/` route uses React + TypeScript from `measurement/react/src`. Build it with `npm ci --prefix measurement/react` and `npm run build --prefix measurement/react` before starting the server. No separate frontend dev server or new credentials are needed. The authenticated FastAPI app serves the same UI at `http://127.0.0.1:4301/measurement/` (`run-backend.cmd`). The existing local server remains available below.

See [migration, tests, structure and rollback](../docs/MEASUREMENT_REACT.md). Legacy UI is retained at `/measurement/legacy.html` for rollback.

## Start

From the CRM project root:

```
python -B measurement/server.py
```

Open http://127.0.0.1:4300/measurement/ . This server extends the existing CRM server with `/api/measurement/requests`; all other department routes retain their existing handlers. The old `run.sh` starts the base server without this endpoint. Use the command above or `measurement/start.cmd` for live Measurement.

## Credentials

The connection reads the supplied private `.env` from outside the web root. Its absolute location is saved in Git-ignored `measurement/backend/env-path.txt`. Alternatively set `MEASUREMENT_ENV_FILE` to its path. The source `.env` is unchanged; no credentials are copied into browser assets or returned by the API. Backend files and `.env` paths are blocked by the Measurement server. Credentials are not printed in logs.

Required keys: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`. Optional data-centre keys: `ZOHO_ACCOUNTS_URL`, `ZOHO_API_DOMAIN` (India defaults). No extra Python packages are needed.

## Live behavior

- Complete paginated read of Orders (`Deals`), including page tokens beyond 2,000 records.
- Exact active/completed workflow mapping from the ZIP for all four visit types. Historical dates do not invent active requests. Missing dates, assignments and coordinates remain missing.
- Five-minute cache, explicit Refresh, sync time and Orders-scanned count. Loading/failure states hide counts instead of presenting a failed fetch as zero records. Partial pagination is rejected.
- Search, filters, stage tabs, request details, area/map views and report exports all use these live records.
- Live records are read-only, matching the ZIP's Zoho adapter. Changes to visits must be made in Zoho, then refreshed here. They are never written into the local CRM store or used to overwrite local client data.
- A measurement assignee is only the actual measurement-person field, not the CRM Owner.
- Offline Leaflet/Natural Earth map with exact site coordinates; Mappls street tiles, messaging, external problems/tasks and role administration are not connected by this read integration.

The previous local request helpers remain available only to isolated tests. The production screen defaults to live Zoho and does not fall back to local/demo clients when a sync fails.

## Validation

```
python -B -m unittest measurement.tests.test_connection -v
node --test measurement/tests/model.test.cjs
```

Backend tests cover mapping, pagination beyond page ten, caching, 401 retry, failed/incomplete sync and host validation. Browser tests use `/measurement/tests/ui.html` for isolated local fixtures; this page never writes to the real store.
