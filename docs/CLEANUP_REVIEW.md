# Approved cleanup — 2026-10-21

User approved only the listed generated files. Removed after verification:

- Root `.pytest_cache/`.
- `__pycache__/` under backend, backend/migrations, backend/migrations/versions, backend/tests, core, measurement/backend, ai, ai/agents, mail, sign and scripts (11 folders).
- Old `dist/crm-source.zip`.

Resolved every target inside the workspace before removal. `.venv`, `node_modules`, `.local`, customer data, uploads, credentials, backup snapshots and compiled frontend assets were excluded. Python caches may naturally reappear when running the app.

Retained pending a separate decision: historical standalone/legacy UI, `online/`, retired `vercel/deploy.py`, `windows-helper/`, historical `deploy/staging/` config and backup snapshots. These were not confirmed safe to delete as a group and were outside the approved list. Required runtime build assets remain in place. No unrelated source was removed or moved.
