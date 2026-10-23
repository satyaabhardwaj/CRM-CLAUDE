"""How the CRM sends its own emails (reset links, sign-in codes). Owner decision, 23 Oct 2026: it must work on any
network, so the Gmail API over HTTPS (port 443, open everywhere) is used when it is set up; SMTP (port 587, blocked on
some networks) is the fallback.

Gmail API: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN (scope gmail.send only), set once by
scripts/set_gmail_api.py. SMTP: RECOVERY_SMTP_HOST, RECOVERY_SMTP_PORT, RECOVERY_SMTP_USER, RECOVERY_SMTP_PASSWORD.
Both send from RECOVERY_MAIL_FROM. Nothing here logs an address, a message, a token or a server's answer.
"""
import base64
import json
import os
import smtplib
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from email.message import EmailMessage

TOKEN_URL = 'https://oauth2.googleapis.com/token'
SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'
GMAIL = ('GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN')
SMTP = ('RECOVERY_SMTP_HOST', 'RECOVERY_SMTP_USER', 'RECOVERY_SMTP_PASSWORD')


class MailError(RuntimeError):
    """The email was not sent (the message is safe to show; it holds no secret)."""


def _post(url, data, headers, timeout=15):
    request = urllib.request.Request(url, data=data, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read() or b'{}')
    except urllib.error.HTTPError as error:
        raise MailError(f'Google answered {error.code}.') from None
    except (urllib.error.URLError, OSError, ValueError):
        raise MailError('Google could not be reached.') from None


class GmailAPI:
    def __init__(self, client_id, client_secret, refresh_token, sender):
        self.client_id, self.client_secret, self.refresh_token, self.sender = client_id, client_secret, refresh_token, sender
        self._token, self._expires, self._lock = '', 0, threading.Lock()

    def access_token(self):
        with self._lock:
            if self._token and time.time() < self._expires - 60:
                return self._token
            body = urllib.parse.urlencode({'client_id': self.client_id, 'client_secret': self.client_secret,
                                           'refresh_token': self.refresh_token, 'grant_type': 'refresh_token'}).encode()
            data = _post(TOKEN_URL, body, {'Content-Type': 'application/x-www-form-urlencoded'})
            if not data.get('access_token'):
                raise MailError('Google did not grant access. Run scripts/set_gmail_api.py again.')
            self._token, self._expires = data['access_token'], time.time() + int(data.get('expires_in', 3600))
            return self._token

    def __call__(self, message):
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        _post(SEND_URL, json.dumps({'raw': raw}).encode(),
              {'Authorization': 'Bearer ' + self.access_token(), 'Content-Type': 'application/json'})


class SMTPMail:
    def __init__(self, host, port, user, password):
        self.host, self.port, self.user, self.password = host, port, user, password

    def __call__(self, message):
        try:
            with smtplib.SMTP(self.host, self.port, timeout=15) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(self.user, self.password)
                server.send_message(message)
        except (OSError, smtplib.SMTPException):
            raise MailError('The mail server could not be used.') from None


def transports(env=None):
    """The configured ways to send, best first. Empty when none is set up."""
    env = os.environ if env is None else env
    sender = env.get('RECOVERY_MAIL_FROM', '')
    out = []
    if sender and all(env.get(k) for k in GMAIL):
        out.append(GmailAPI(env['GMAIL_CLIENT_ID'], env['GMAIL_CLIENT_SECRET'], env['GMAIL_REFRESH_TOKEN'], sender))
    if sender and all(env.get(k) for k in SMTP):
        out.append(SMTPMail(env['RECOVERY_SMTP_HOST'], int(env.get('RECOVERY_SMTP_PORT', '587')),
                            env['RECOVERY_SMTP_USER'], env['RECOVERY_SMTP_PASSWORD']))
    return out


def mailer(env=None):
    """send(to, subject, body), or None when no way to send is configured. Tries each way in turn."""
    env = os.environ if env is None else env
    ways = transports(env)
    if not ways:
        return None
    sender = env['RECOVERY_MAIL_FROM']

    def send(to, subject, body):
        message = EmailMessage()
        message['From'] = sender
        message['To'] = to
        message['Subject'] = subject
        message.set_content(body)
        last = None
        for way in ways:
            try:
                return way(message)
            except MailError as error:
                last = error
        raise last
    return send
