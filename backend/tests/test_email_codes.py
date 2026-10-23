"""Sign-in code by email (owner decision, 23 Oct 2026). Synthetic identities; mail is captured, never sent."""
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, insert, select
from backend import email_codes
from backend.app import create_app
from backend.config import Settings
from backend.models import audit, login_codes, recovery_emails, sessions
from backend.provision_user import provision
from backend.tests.test_api import api

ORIGIN = 'https://crm.example.test'
PASSWORD = 'Synthetic-Email-Code-1'


@pytest.fixture
def mail(api, tmp_path, monkeypatch):
    _, engine, _ = api
    clock = [1_800_000_000]
    monkeypatch.setattr(email_codes, 'time', SimpleNamespace(time=lambda: clock[0]))
    outbox, broken = [], [False]

    def sender(email, code):
        if broken[0]:
            raise OSError('mail down')
        outbox.append((email, code))

    def client(with_mailbox=True, email='owner@qa.invalid', role='admin'):
        uid = provision(engine, email, PASSWORD, role)
        if with_mailbox:
            with engine.begin() as db:
                db.execute(insert(recovery_emails).values(user_id=uid, email=email))
        settings = Settings(str(engine.url), ORIGIN, uploads=tmp_path)
        c = TestClient(create_app(settings, engine, code_sender=sender), base_url=ORIGIN)
        c.headers['Origin'] = ORIGIN
        return c, uid
    return SimpleNamespace(engine=engine, clock=clock, outbox=outbox, broken=broken, client=client)


def sign_in(c, email='owner@qa.invalid', password=PASSWORD):
    return c.post('/api/auth/login', json={'email': email, 'password': password})


def test_password_then_emailed_code_signs_in(mail):
    c, uid = mail.client()
    first = sign_in(c)
    assert first.status_code == 202
    assert first.json() == {'mfa_required': True, 'method': 'email', 'to': 'o***@qa.invalid'}
    assert c.get('/api/auth/me').status_code == 401  # nothing works with the password alone
    (to, code), = mail.outbox
    assert to == 'owner@qa.invalid' and len(code) == 6 and code.isdigit()
    with mail.engine.connect() as db:
        stored = str(db.execute(select(login_codes)).all())
    assert code not in stored  # only hashes are stored
    assert c.post('/api/auth/email-code/verify', json={'code': code}).status_code == 200
    assert c.get('/api/auth/me').json()['id'] == uid
    # Used once only.
    assert c.post('/api/auth/email-code/verify', json={'code': code}).status_code == 401
    with mail.engine.connect() as db:
        actions = set(db.execute(select(audit.c.action).where(audit.c.user_id == uid)).scalars())
    assert {'auth.email_code_sent', 'auth.email_code_login'} <= actions


def test_wrong_codes_expiry_and_attempt_limit(mail):
    c, _ = mail.client()
    sign_in(c)
    code = mail.outbox[-1][1]
    wrong = '000000' if code != '000000' else '111111'
    for _ in range(5):
        assert c.post('/api/auth/email-code/verify', json={'code': wrong}).status_code == 401
    assert c.post('/api/auth/email-code/verify', json={'code': code}).status_code == 401  # locked after 5
    sign_in(c)
    mail.clock[0] += 601
    assert c.post('/api/auth/email-code/verify', json={'code': mail.outbox[-1][1]}).status_code == 401


def test_resend_replaces_the_code_and_is_limited(mail):
    c, _ = mail.client()
    sign_in(c)
    old = mail.outbox[-1][1]
    for _ in range(3):
        assert c.post('/api/auth/email-code/resend').status_code == 200
    assert c.post('/api/auth/email-code/resend').status_code == 429
    newest = mail.outbox[-1][1]
    if old != newest:
        assert c.post('/api/auth/email-code/verify', json={'code': old}).status_code == 401
    assert c.post('/api/auth/email-code/verify', json={'code': newest}).status_code == 200


def test_a_password_change_cancels_a_pending_code(mail):
    c, uid = mail.client()
    sign_in(c)
    code = mail.outbox[-1][1]
    from backend.auth import password_hash
    from backend.models import credentials
    with mail.engine.begin() as db:
        db.execute(credentials.update().where(credentials.c.user_id == uid).values(password_hash=password_hash('Another-Password-99')))
    assert c.post('/api/auth/email-code/verify', json={'code': code}).status_code == 401


def test_mail_failure_signs_nobody_in(mail):
    c, _ = mail.client()
    mail.broken[0] = True
    response = sign_in(c)
    assert response.status_code == 503 and 'could not be sent' in response.json()['error']
    with mail.engine.connect() as db:
        assert db.scalar(select(func.count()).select_from(login_codes)) == 0
        assert db.scalar(select(func.count()).select_from(sessions)) == 0


def test_accounts_without_a_verified_mailbox_use_the_password_only(mail):
    c, _ = mail.client(with_mailbox=False, email='staff@qa.invalid', role='sales')
    assert sign_in(c, 'staff@qa.invalid').status_code == 200
    assert mail.outbox == []


def test_codes_are_off_without_the_setting(api, tmp_path, monkeypatch):
    _, engine, _ = api
    monkeypatch.delenv('CRM_EMAIL_OTP', raising=False)
    assert email_codes.configured_sender() is None
    monkeypatch.setenv('CRM_EMAIL_OTP', '1')
    for name in ('RECOVERY_SMTP_HOST', 'RECOVERY_SMTP_USER', 'RECOVERY_SMTP_PASSWORD', 'RECOVERY_MAIL_FROM'):
        monkeypatch.delenv(name, raising=False)
    with pytest.raises(RuntimeError, match='RECOVERY_SMTP'):
        email_codes.configured_sender()


def test_sign_out_cancels_a_pending_code(mail):
    c, _ = mail.client()
    sign_in(c)
    code, cookie = mail.outbox[-1][1], c.cookies.get('crm_email_challenge')
    c.post('/api/auth/logout')
    c.cookies.set('crm_email_challenge', cookie)  # the server cancelled it, not just the browser
    assert c.post('/api/auth/email-code/verify', json={'code': code}).status_code == 401
