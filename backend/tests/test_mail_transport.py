"""CRM emails on any network: Gmail API over HTTPS first, SMTP as fallback. Google and mail servers are faked."""
import base64
import json
import sys
import threading
import urllib.parse
import urllib.request
from email import message_from_bytes
import pytest
sys.path.insert(0, '.')
from backend import mail_transport as mt
from scripts import set_gmail_api as setup

GMAIL_ENV = {'GMAIL_CLIENT_ID': 'cid', 'GMAIL_CLIENT_SECRET': 'csecret', 'GMAIL_REFRESH_TOKEN': 'rtoken',
             'RECOVERY_MAIL_FROM': 'info@example.test'}
SMTP_ENV = {'RECOVERY_SMTP_HOST': 'smtp.example.test', 'RECOVERY_SMTP_USER': 'info@example.test',
            'RECOVERY_SMTP_PASSWORD': 'app-pass', 'RECOVERY_MAIL_FROM': 'info@example.test'}


class FakeGoogle:
    def __init__(self, fail_send=False):
        self.calls, self.fail_send = [], fail_send

    def __call__(self, url, data, headers, timeout=15):
        self.calls.append((url, data, headers))
        if url == mt.TOKEN_URL:
            form = urllib.parse.parse_qs(data.decode())
            if form['grant_type'] == ['authorization_code']:
                return {'refresh_token': 'new-refresh', 'access_token': 'a1', 'expires_in': 3600}
            return {'access_token': 'a1', 'expires_in': 3600}
        if self.fail_send:
            raise mt.MailError('Google answered 403.')
        return {'id': 'm1'}

    def sent(self):
        return [message_from_bytes(base64.urlsafe_b64decode(json.loads(d)['raw']))
                for u, d, h in self.calls if u == mt.SEND_URL]


def test_gmail_api_sends_over_https_with_a_refreshed_token(monkeypatch):
    google = FakeGoogle()
    monkeypatch.setattr(mt, '_post', google)
    send = mt.mailer(GMAIL_ENV)
    send('owner@example.test', '123456 is your code', 'Your code is 123456.')
    send('owner@example.test', 'again', 'again')
    message = google.sent()[0]
    assert message['To'] == 'owner@example.test' and message['From'] == 'info@example.test'
    assert all(u.startswith('https://') for u, _, _ in google.calls)
    assert sum(u == mt.TOKEN_URL for u, _, _ in google.calls) == 1  # the access token is reused until it expires
    assert google.calls[-1][2]['Authorization'] == 'Bearer a1'


def test_falls_back_to_smtp_when_the_api_fails(monkeypatch):
    monkeypatch.setattr(mt, '_post', FakeGoogle(fail_send=True))
    smtp_sent = []
    monkeypatch.setattr(mt.SMTPMail, '__call__', lambda self, message: smtp_sent.append(message['To']))
    mt.mailer({**GMAIL_ENV, **SMTP_ENV})('owner@example.test', 's', 'b')
    assert smtp_sent == ['owner@example.test']


def test_reports_failure_without_secrets_when_every_way_fails(monkeypatch):
    monkeypatch.setattr(mt, '_post', FakeGoogle(fail_send=True))
    with pytest.raises(mt.MailError) as error:
        mt.mailer(GMAIL_ENV)('owner@example.test', 's', 'b')
    assert 'csecret' not in str(error.value) and 'rtoken' not in str(error.value)


def test_nothing_configured_means_no_mailer():
    assert mt.mailer({}) is None
    assert mt.mailer({'GMAIL_CLIENT_ID': 'x'}) is None  # incomplete settings never half-send


def test_reset_and_sign_in_codes_use_the_gmail_api(monkeypatch):
    from backend import email_codes, recovery
    google = FakeGoogle()
    monkeypatch.setattr(mt, '_post', google)
    for key, value in {**GMAIL_ENV, 'CRM_EMAIL_OTP': '1', 'CRM_RECOVERY_ENABLED': '1'}.items():
        monkeypatch.setenv(key, value)
    for key in ('RECOVERY_SMTP_HOST', 'RECOVERY_SMTP_USER', 'RECOVERY_SMTP_PASSWORD'):
        monkeypatch.delenv(key, raising=False)
    email_codes.configured_sender()('owner@example.test', '654321')
    recovery.configured_sender()('owner@example.test', 'https://crm.example.test/reset-password#token=x')
    subjects = [m['Subject'] for m in google.sent()]
    assert subjects == ['654321 is your MAGPPIE CRM sign-in code', 'Reset your MAGPPIE CRM password']


def test_setup_signs_in_with_google_sends_a_test_and_saves(tmp_path, monkeypatch, capsys):
    env = tmp_path / '.env.local'
    env.write_text('DATABASE_URL=x\nCRM_EMAIL_OTP=0\n', encoding='utf-8')
    client = tmp_path / 'client.json'
    client.write_text(json.dumps({'installed': {'client_id': 'cid', 'client_secret': 'csecret'}}), encoding='utf-8')
    google = FakeGoogle()
    monkeypatch.setattr(setup, 'ENV', env)
    monkeypatch.setattr(setup, '_post', google)
    monkeypatch.setattr(mt, '_post', google)

    def browser(url):
        # Google sends the browser back to the local address with a code and the same state.
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
        assert query['scope'] == [setup.SCOPE] and query['code_challenge_method'] == ['S256']
        back = query['redirect_uri'][0] + '?' + urllib.parse.urlencode({'code': 'c1', 'state': query['state'][0]})
        threading.Thread(target=lambda: urllib.request.urlopen(back, timeout=5).read()).start()

    setup.main(['--email', 'Info@Example.test', '--client-file', str(client)], open_browser=browser)
    saved = env.read_text(encoding='utf-8')
    assert 'GMAIL_REFRESH_TOKEN=new-refresh' in saved and 'CRM_EMAIL_OTP=1' in saved and 'CRM_RECOVERY_ENABLED=1' in saved
    assert google.sent()[0]['To'] == 'info@example.test'
    out = capsys.readouterr().out
    assert 'new-refresh' not in out and 'csecret' not in out


def test_setup_changes_nothing_when_the_test_email_fails(tmp_path, monkeypatch):
    env = tmp_path / '.env.local'
    env.write_text('A=1\n', encoding='utf-8')
    client = tmp_path / 'client.json'
    client.write_text(json.dumps({'installed': {'client_id': 'cid', 'client_secret': 'csecret'}}), encoding='utf-8')
    google = FakeGoogle(fail_send=True)
    monkeypatch.setattr(setup, 'ENV', env)
    monkeypatch.setattr(setup, '_post', google)
    monkeypatch.setattr(mt, '_post', google)
    monkeypatch.setattr(setup, 'authorize', lambda *a, **k: 'r1')
    with pytest.raises(SystemExit, match='Nothing was changed'):
        setup.main(['--email', 'info@example.test', '--client-file', str(client)])
    assert env.read_text(encoding='utf-8') == 'A=1\n'
