import json
from types import SimpleNamespace

import pytest

from backend import local_startup


def test_environment_override_never_starts_legacy_cluster(tmp_path):
    (tmp_path / '.local').mkdir()
    (tmp_path / '.local/backend-local.json').write_text(json.dumps({'DATABASE_URL': 'unused'}))
    (tmp_path / '.env.local').write_text('DATABASE_URL=other')
    assert local_startup.owned_cluster(tmp_path, 'unused') is None


def test_stopped_owned_cluster_is_started_before_connect(monkeypatch, tmp_path):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://localhost/test')
    monkeypatch.setattr(local_startup, 'owned_cluster', lambda *args: (tmp_path / 'pg_ctl', tmp_path / 'data'))
    calls = []
    def run(args, **kwargs):
        calls.append(args)
        return SimpleNamespace(returncode=3 if args[-1] == 'status' else 0)
    monkeypatch.setattr(local_startup.subprocess, 'run', run)
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, query): calls.append('connected')
    monkeypatch.setattr(local_startup, 'create_engine', lambda *a, **k: SimpleNamespace(connect=Connection, dispose=lambda: None))
    local_startup.ensure_database()
    assert calls[0][-1] == 'status'
    assert calls[1][-1] == 'start'
    assert calls[2] == 'connected'


def test_failed_start_does_not_launch_database_connection(monkeypatch, tmp_path):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://localhost/test')
    monkeypatch.setattr(local_startup, 'owned_cluster', lambda *args: (tmp_path / 'pg_ctl', tmp_path / 'data'))
    monkeypatch.setattr(local_startup.subprocess, 'run', lambda args, **kw: SimpleNamespace(returncode=3 if args[-1] == 'status' else 1))
    with pytest.raises(RuntimeError, match='could not start'):
        local_startup.ensure_database()
