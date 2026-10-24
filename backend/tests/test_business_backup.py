import pytest
from sqlalchemy import create_engine, insert, select
from backend.models import metadata, users, clients, state
from scripts.business_backup import export_business, fingerprints, import_business


def test_business_only_roundtrip_and_occupied_destination_refusal(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'destination.db'))
    metadata.create_all(engine)
    rows = {'crm_state': [{'id': 1, 'rev': 19, 'payload': {'architects': []}}],
            'crm_clients': [{'id': 'synthetic', 'position': 4, 'version': 7, 'payload': {'id': 'synthetic', 'nested': {'preserve': True}}}]}
    expected = fingerprints(rows)
    with engine.begin() as db:
        import_business(db, rows, expected)
        assert export_business(db) == rows
        assert db.execute(select(users)).first() is None
    with pytest.raises(ValueError, match='must all be empty'):
        with engine.begin() as db: import_business(db, rows, expected)
    with pytest.raises(ValueError, match='only crm_state'):
        with engine.begin() as db: import_business(db, dict(rows, crm_users=[]), expected)
    engine.dispose()


def test_identity_or_tampered_rows_prevent_any_import(tmp_path):
    engine = create_engine('sqlite:///' + str(tmp_path / 'destination.db'))
    metadata.create_all(engine)
    rows = {'crm_state': [{'id': 1, 'rev': 0, 'payload': {}}], 'crm_clients': []}
    expected = fingerprints(rows)
    with engine.begin() as db: db.execute(insert(users).values(id='existing', role='reader', active=1))
    with pytest.raises(ValueError, match='must all be empty'):
        with engine.begin() as db: import_business(db, rows, expected)
    rows['crm_state'][0]['rev'] = 1
    with pytest.raises(ValueError, match='manifest'):
        with engine.begin() as db: import_business(db, rows, expected)
    with engine.connect() as db:
        assert db.execute(select(state)).first() is None
        assert db.execute(select(clients)).first() is None
        assert db.scalar(select(users.c.id)) == 'existing'
    engine.dispose()
