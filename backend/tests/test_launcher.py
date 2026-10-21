import pytest
from scripts import launch_local


def test_refuses_wildcard_docker_binding():
    with pytest.raises(RuntimeError, match='Localhost'):
        launch_local.validate_settings({'PortBindingBehavior': 'default-port-binding'})
    launch_local.validate_settings({'PortBindingBehavior': 'default-local-port-binding'})


def test_rejects_stale_or_other_stack_credentials(monkeypatch):
    status = {'DB_URL': 'postgresql://local/test', 'API_URL': 'http://127.0.0.1:56321',
              'SERVICE_ROLE_KEY': 'synthetic'}
    monkeypatch.setenv('DATABASE_URL', 'postgresql+psycopg://local/test')
    monkeypatch.setenv('SUPABASE_URL', status['API_URL'])
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'synthetic')
    monkeypatch.setenv('CRM_STORAGE_BACKEND', 'supabase')
    launch_local.validate_status(status)
    monkeypatch.setenv('SUPABASE_SERVICE_ROLE_KEY', 'different')
    with pytest.raises(RuntimeError, match='does not match'):
        launch_local.validate_status(status)


def test_wait_for_is_bounded(monkeypatch):
    times = iter([0, 1, 3])
    monkeypatch.setattr(launch_local.time, 'monotonic', lambda: next(times))
    monkeypatch.setattr(launch_local.time, 'sleep', lambda _: None)
    with pytest.raises(RuntimeError, match='did not become ready'):
        launch_local.wait_for(lambda: False, 2, 'Synthetic service')


def test_log_redacts_supabase_keys_and_database_credentials():
    text = ('│ Secret      │ sb_secret_synthetic │\n'
            '│ Access Key │ synthetic-access │\n'
            '│ URL        │ http://127.0.0.1:56321/storage/v1/s3 │\n'
            'DB postgresql://postgres:synthetic@127.0.0.1:56322/postgres\n')
    redacted = launch_local.redact(text)
    assert 'synthetic' not in redacted
    assert 'http://127.0.0.1:56321/storage/v1/s3' in redacted
    assert '127.0.0.1:56322/postgres' in redacted
