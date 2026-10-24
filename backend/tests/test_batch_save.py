from sqlalchemy import event, select
from backend.models import clients
from backend.repository import save_legacy, snapshot
from backend.tests.test_api import api


def test_save_queries_stay_bounded_and_versions_change_only_for_payload(api):
    _, engine, _ = api
    with engine.begin() as db:
        data = snapshot(db)
        data['clients'] += [{'id': f'synthetic-{i}', 'name': 'Synthetic'} for i in range(540)]
        save_legacy(db, {'id': 'a', 'role': 'admin'}, data)
    calls = []
    def observe(*args): calls.append(args[2])
    event.listen(engine, 'before_cursor_execute', observe)
    try:
        with engine.begin() as db:
            data = snapshot(db)
            data['clients'][0]['name'] = 'Changed'
            data['clients'][1], data['clients'][2] = data['clients'][2], data['clients'][1]
            save_legacy(db, {'id': 'a', 'role': 'admin'}, data)
        assert len(calls) <= 10
    finally:
        event.remove(engine, 'before_cursor_execute', observe)
    with engine.connect() as db:
        rows = {row.id: row for row in db.execute(select(clients))}
        assert rows['c1'].version == 1
        assert rows['c2'].version == 0 and rows['c2'].position == 2
        assert rows['synthetic-0'].version == 0 and rows['synthetic-0'].position == 1
