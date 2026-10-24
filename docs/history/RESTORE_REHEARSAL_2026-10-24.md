# Synthetic restore rehearsal — 24 October 2026

Production cutover is explicitly deferred. No live customer rows/files were used, changed, copied or deleted. All database writes were to newly created QA databases, and all Storage writes were to new crm-qa-* private buckets. Resources are retained for inspection; no cleanup or drop was performed.

## What ran

`backend/tests/test_restore_rehearsal.py` is opt-in through RUN_LOCAL_RESTORE_REHEARSAL=1. It refuses non-loopback PostgreSQL, non-test database names and non-local Storage. Credentials are supplied privately through environment variables; none appear in this report.

1. Create two new crm_crud_test_* databases and migrate each to head 0012.
2. Seed 540 synthetic business rows, including Unicode/nested values and nonzero versions, plus one synthetic user/credential that must not be imported.
3. Create new private source/destination buckets; write three synthetic attachments, including a 2 MiB binary.
4. Run the real backup_postgres.main with --writes-paused --restore-check, real PostgreSQL 17 client tools and actual Storage. Its full dump restores into a third new database and all table fingerprints must match.
5. Run restore_business_only orchestration with transport adapters redirected to the local QA database/Storage. Input validation, empty-target checks, RLS/grant checks, transaction handling, file uploads and read-back hashing are the production implementation. The hosted URL guard is unchanged; no network request uses the dummy hosted address.
6. Reconcile every business row fingerprint and attachment hash, prove all destination non-business CRM tables empty, and refuse an occupied-bucket rerun before writing. Verify source business rows and credential remain unchanged.

## Evidence

```json
{
  "scope": "local synthetic; real PostgreSQL and Storage; hosted transport adapted",
  "source_database": "crm_crud_test_source_4c69ba4f65f34c33",
  "target_database": "crm_crud_test_target_4c69ba4f65f34c33",
  "full_restore_database": "crm_restore_11a3b31a9b804d00845926745812fbc4",
  "source_bucket": "crm-qa-source-4c69ba4f65f34c33",
  "target_bucket": "crm-qa-target-4c69ba4f65f34c33",
  "business": {
    "crm_state": {
      "rows": 1,
      "sha256": "96737c07326cf34998ea425c619bf7e21155c1e6eed2407220dd2b972da0e7f0"
    },
    "crm_clients": {
      "rows": 540,
      "sha256": "1e37bedcd8db55de050a6749e9e82b8c80a56279616b04c1ef00f1e544fc809a"
    }
  },
  "attachment_hashes": {
    "qa-restore-0/synthetic.txt": "ee45c640f343b243a36f0c59c54c1b6c8fb84157383348fc864facc9e855dab9",
    "qa-restore-1/unicode.txt": "8c1fead542cfa695c4edeaef80ee04ef53ec39af07cfc75af399b547b2cdb4fb",
    "qa-restore-539/synthetic.bin": "91d3beb88a9b2f778a6c44a1c53b63d3c79931845a9aef84b3fb414610bd1938"
  },
  "full_backup_restore_verified": true,
  "business_matches": true,
  "attachments_match": true,
  "identities_imported": 0,
  "occupied_bucket_refused": true,
  "source_unchanged": true
}
```

The local rehearsal does not certify hosted connectivity, Vercel variables, TLS/pooler behaviour, hosted provider limits, production identities, or a final live-data reconciliation. Those require the remaining hosted gates. Standard CI skips this opt-in test because it has no private Storage credentials; the actual local run is recorded separately.
