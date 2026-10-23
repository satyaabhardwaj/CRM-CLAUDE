"""scripts/set_recovery_mail.py: saves the reset-email settings only after a real test email went out."""
import smtplib
import sys
import pytest
sys.path.insert(0, '.')
from scripts import set_recovery_mail as tool


def test_update_replaces_live_keys_and_keeps_comments():
    text = 'A=1\nCRM_RECOVERY_ENABLED=0\n# RECOVERY_SMTP_HOST=old\n'
    out = tool.update(text, {'CRM_RECOVERY_ENABLED': '1', 'RECOVERY_SMTP_HOST': 'smtp.gmail.com'})
    assert out == 'A=1\nCRM_RECOVERY_ENABLED=1\n# RECOVERY_SMTP_HOST=old\nRECOVERY_SMTP_HOST=smtp.gmail.com\n'


class FakeSMTP:
    sent = []
    refuse = False

    def __init__(self, host, port, timeout):
        self.host = host

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self, context):
        pass

    def login(self, user, password):
        if FakeSMTP.refuse:
            raise smtplib.SMTPAuthenticationError(535, b'no')

    def send_message(self, message):
        FakeSMTP.sent.append(message['To'])


@pytest.fixture
def env(tmp_path, monkeypatch):
    path = tmp_path / '.env.local'
    path.write_text('DATABASE_URL=x\nCRM_RECOVERY_ENABLED=0\n', encoding='utf-8')
    monkeypatch.setattr(tool, 'ENV', path)
    monkeypatch.setattr(tool.smtplib, 'SMTP', FakeSMTP)
    monkeypatch.setattr(tool.getpass, 'getpass', lambda prompt: 'abcd efgh ijkl mnop')
    monkeypatch.setattr(sys, 'argv', ['set_recovery_mail', '--email', 'Info@Example.test'])
    FakeSMTP.sent, FakeSMTP.refuse = [], False
    return path


def test_refused_sign_in_changes_nothing(env, capsys):
    FakeSMTP.refuse = True
    with pytest.raises(SystemExit, match='App Password'):
        tool.main()
    assert env.read_text(encoding='utf-8') == 'DATABASE_URL=x\nCRM_RECOVERY_ENABLED=0\n'


def test_success_sends_a_test_mail_then_saves_without_printing_the_password(env, capsys):
    tool.main()
    saved = env.read_text(encoding='utf-8')
    assert FakeSMTP.sent == ['info@example.test']
    assert 'CRM_RECOVERY_ENABLED=1' in saved and 'RECOVERY_SMTP_PASSWORD=abcdefghijklmnop' in saved
    assert 'abcdefghijklmnop' not in capsys.readouterr().out
