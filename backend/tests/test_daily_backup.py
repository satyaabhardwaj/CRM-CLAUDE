"""Nightly backup job: keeps 30 days of its own folders, never touches backups made by hand."""
import sys
from datetime import datetime
sys.path.insert(0, '.')
from scripts import daily_backup as job


def make(root, *names):
    for name in names:
        (root / name).mkdir(parents=True)
        (root / name / 'manifest.json').write_text('{}', encoding='utf-8')


def test_prune_keeps_30_days_and_hand_made_backups(tmp_path, monkeypatch):
    monkeypatch.setattr(job, 'BACKUPS', tmp_path)
    make(tmp_path, 'daily-20260901-2300', 'daily-20260920-2300', 'daily-20261001-2300', 'daily-20261020-2300',
         'daily-20261022-2300', 'before-auth-roles-20261023', 'phase0-20261021-2322', 'daily-notadate')
    removed = job.prune(now=datetime(2026, 10, 23, 23, 30))
    assert removed == ['daily-20260920-2300', 'daily-20260901-2300']
    left = sorted(p.name for p in tmp_path.iterdir())
    assert 'before-auth-roles-20261023' in left and 'phase0-20261021-2322' in left and 'daily-notadate' in left


def test_prune_always_keeps_the_newest_three(tmp_path, monkeypatch):
    monkeypatch.setattr(job, 'BACKUPS', tmp_path)
    make(tmp_path, 'daily-20260101-2300', 'daily-20260102-2300', 'daily-20260103-2300')
    assert job.prune(now=datetime(2026, 10, 23)) == []


def test_only_its_own_rehearsal_database_can_be_dropped(tmp_path, monkeypatch):
    dropped = []

    class Engine:
        def connect(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def execute(self, statement, params=None):
            dropped.append(str(statement))

        def dispose(self):
            pass

    import sqlalchemy
    monkeypatch.setattr(sqlalchemy, 'create_engine', lambda *a, **k: Engine())
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://u:p@127.0.0.1:5432/postgres')
    for name in ('postgres', 'crm_restore_abc;drop', 'other_db'):
        (tmp_path / 'manifest.json').write_text('{"rehearsal_database": "%s"}' % name, encoding='utf-8')
        job.drop_rehearsal(tmp_path)
    assert dropped == []
    (tmp_path / 'manifest.json').write_text('{"rehearsal_database": "crm_restore_0123abcd"}', encoding='utf-8')
    job.drop_rehearsal(tmp_path)
    assert any('DROP DATABASE IF EXISTS "crm_restore_0123abcd"' in s for s in dropped)
