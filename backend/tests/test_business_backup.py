import os
import uuid
import pytest
from sqlalchemy import create_engine, insert, select, event, text
from sqlalchemy.engine import make_url
from backend.models import metadata, users, clients, state
from scripts.business_backup import export_business, fingerprints, import_business


@pytest.fixture(params=['sqlite', 'postgresql'])
def empty_destination(request, tmp_path):
    raw = os.environ.get('TEST_DATABASE_URL')
    if request.param == 'postgresql':
        if not raw: pytest.skip('Requires isolated TEST_DATABASE_URL')
        url = make_url(raw)
        assert url.host in ('localhost', '127.0.0.1') and url.database.startswith('crm_crud_test_')
        engine = create_engine(url)
        schema = 'business_' + uuid.uuid4().hex
        with engine.begin() as db: db.execute(text('CREATE SCHEMA ' + schema))
        engine.dispose()
        @event.listens_for(engine, 'connect')
        def isolate(connection, _):
            with connection.cursor() as cursor: cursor.execute('SET search_path TO ' + schema)
            connection.commit()
    else:
        engine = create_engine('sqlite:///' + str(tmp_path / 'destination.db'))
    metadata.create_all(engine)
    yield engine
    engine.dispose()


def test_business_only_roundtrip_and_occupied_destination_refusal(empty_destination):
    engine = empty_destination
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


def test_identity_or_tampered_rows_prevent_any_import(empty_destination):
    engine = empty_destination
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
