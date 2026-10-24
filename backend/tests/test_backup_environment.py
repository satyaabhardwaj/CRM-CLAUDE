"""Hosted backups must never mix in this laptop's live configuration."""
from types import SimpleNamespace
import pytest
from scripts import backup_postgres


@pytest.mark.parametrize('environment', ['preview', 'production'])
def test_hosted_backup_never_loads_local_settings(monkeypatch, environment):
    monkeypatch.setenv('CRM_ENV', environment)
    monkeypatch.setattr(backup_postgres, 'load', lambda: pytest.fail('Read local live settings'))
    settings = SimpleNamespace(storage_backend='supabase')
    monkeypatch.setattr(backup_postgres.Settings, 'load', lambda: settings)
    assert backup_postgres.load_backup_settings() is settings


def test_hosted_backup_refuses_filesystem_fallback(monkeypatch):
    monkeypatch.setenv('CRM_ENV', 'production')
    monkeypatch.setattr(backup_postgres, 'load', lambda: pytest.fail('Read local live settings'))
    monkeypatch.setattr(backup_postgres.Settings, 'load', lambda: SimpleNamespace(storage_backend='filesystem'))
    with pytest.raises(RuntimeError, match='explicit Supabase'):
        backup_postgres.load_backup_settings()
