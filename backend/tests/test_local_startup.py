from types import SimpleNamespace

import pytest

from backend import local_startup


def test_missing_configuration_is_refused(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    with pytest.raises(RuntimeError, match='configuration is missing'):
        local_startup.ensure_database()


def test_connection_is_checked(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://localhost/test')
    calls = []
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, query): calls.append('connected')
    monkeypatch.setattr(local_startup, 'create_engine', lambda *a, **k: SimpleNamespace(connect=Connection, dispose=lambda: None))
    local_startup.ensure_database()
    assert calls == ['connected']


def test_failed_connection_is_redacted_and_disposed(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://localhost/test')
    calls = []
    def fail(): raise RuntimeError('private connection details')
    monkeypatch.setattr(local_startup, 'create_engine', lambda *a, **k: SimpleNamespace(connect=fail, dispose=lambda: calls.append('disposed')))
    with pytest.raises(RuntimeError, match='Database is unavailable') as error:
        local_startup.ensure_database()
    assert 'private' not in str(error.value)
    assert calls == ['disposed']
