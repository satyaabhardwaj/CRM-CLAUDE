"""One-time setup so the CRM sends its emails (reset links, sign-in codes) through the Gmail API over HTTPS, which
works on any network (port 443), unlike SMTP (port 587, blocked on some networks).

  .venv\\Scripts\\python.exe scripts\\set_gmail_api.py --email info@mymagppie.com --client-file PATH_TO_CLIENT_JSON

PATH_TO_CLIENT_JSON is the OAuth client ("Desktop app") downloaded from Google Cloud for this mailbox; see
docs/SETUP.md "Email on any network". The browser opens Google's sign-in: sign in as the mailbox and allow
"Send email on your behalf" (send only; it cannot read mail). A test email is then sent through the API, and only
after it is accepted are GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, RECOVERY_MAIL_FROM,
CRM_RECOVERY_ENABLED=1 and (unless --no-login-codes) CRM_EMAIL_OTP=1 written to .env.local. Nothing secret is printed.
"""
import argparse
import base64
import hashlib
import http.server
import json
import secrets
import sys
import threading
import urllib.parse
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from backend.mail_transport import GmailAPI, MailError, TOKEN_URL, _post  # noqa: E402
from scripts.set_recovery_mail import update  # noqa: E402

ENV = ROOT / '.env.local'
AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
SCOPE = 'https://www.googleapis.com/auth/gmail.send'


def read_client(path):
    try:
        data = json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        raise SystemExit('Could not read the client file. Download it again from Google Cloud (OAuth client, Desktop app).') from None
    client = data.get('installed') or data.get('web') or {}
    if not client.get('client_id') or not client.get('client_secret'):
        raise SystemExit('That file is not an OAuth client. Choose "Desktop app" when creating it.')
    return client['client_id'], client['client_secret']


def authorize(client_id, client_secret, email, open_browser=webbrowser.open, timeout=300):
    """Google's sign-in in the browser; returns a refresh token (kept in memory only)."""
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    state = secrets.token_urlsafe(24)
    result = {}

    class Reply(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
            if query.get('state', [''])[0] == state:
                result['code'] = query.get('code', [''])[0]
                result['error'] = query.get('error', [''])[0]
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write('<p>MAGPPIE CRM: you can close this tab and go back to the terminal.</p>'.encode())

        def log_message(self, *args):
            pass  # never log the code

    server = http.server.HTTPServer(('127.0.0.1', 0), Reply)
    redirect = f'http://127.0.0.1:{server.server_port}/'
    url = AUTH_URL + '?' + urllib.parse.urlencode({
        'client_id': client_id, 'redirect_uri': redirect, 'response_type': 'code', 'scope': SCOPE,
        'access_type': 'offline', 'prompt': 'consent', 'login_hint': email, 'state': state,
        'code_challenge': challenge, 'code_challenge_method': 'S256'})
    print('Opening Google sign-in in your browser. Sign in as ' + email + ' and allow sending email.')
    print('If the browser does not open, copy this address into it:\n' + url)
    worker = threading.Thread(target=server.handle_request, daemon=True)
    server.timeout = timeout
    worker.start()
    open_browser(url)
    worker.join(timeout + 5)
    server.server_close()
    if not result.get('code'):
        raise SystemExit('Google sign-in was not completed' + (' (' + result['error'] + ')' if result.get('error') else '')
                         + '. Nothing was changed.')
    try:
        tokens = _post(TOKEN_URL, urllib.parse.urlencode({
            'client_id': client_id, 'client_secret': client_secret, 'code': result['code'], 'code_verifier': verifier,
            'grant_type': 'authorization_code', 'redirect_uri': redirect}).encode(),
            {'Content-Type': 'application/x-www-form-urlencoded'})
    except MailError as error:
        raise SystemExit(f'Google did not accept the sign-in ({error}). Nothing was changed.') from None
    if not tokens.get('refresh_token'):
        raise SystemExit('Google gave no long-term access. Remove "MAGPPIE CRM" from the account\'s third-party access and run this again.')
    return tokens['refresh_token']


def main(argv=None, open_browser=webbrowser.open):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--email', required=True, help='The mailbox that sends (also the admin who receives codes)')
    parser.add_argument('--client-file', required=True, help='OAuth client JSON (Desktop app) from Google Cloud')
    parser.add_argument('--no-login-codes', action='store_true', help='Only reset emails; no sign-in codes by email')
    args = parser.parse_args(argv)
    if not ENV.exists():
        raise SystemExit('.env.local is missing. Complete local setup first (docs/SETUP.md).')
    email = args.email.strip().lower()
    client_id, client_secret = read_client(args.client_file)
    refresh = authorize(client_id, client_secret, email, open_browser)
    from email.message import EmailMessage
    message = EmailMessage()
    message['From'], message['To'] = email, email
    message['Subject'] = 'MAGPPIE CRM: email over HTTPS is working'
    message.set_content('This test confirms the CRM can send reset links and sign-in codes from this mailbox on any '
                        'network. No action needed.')
    try:
        GmailAPI(client_id, client_secret, refresh, email)(message)
    except MailError as error:
        raise SystemExit(f'The test email was not sent ({error}). Check that the Gmail API is enabled in that Google '
                         'Cloud project. Nothing was changed.') from None
    ENV.write_text(update(ENV.read_text(encoding='utf-8'), {
        'GMAIL_CLIENT_ID': client_id, 'GMAIL_CLIENT_SECRET': client_secret, 'GMAIL_REFRESH_TOKEN': refresh,
        'RECOVERY_MAIL_FROM': email, 'CRM_RECOVERY_ENABLED': '1',
        'CRM_EMAIL_OTP': '0' if args.no_login_codes else '1',
    }), encoding='utf-8')
    codes = '' if args.no_login_codes else ' and sign-in codes'
    print(f'Test email sent to {email} over HTTPS. Reset emails{codes} now work on any network. '
          'Restart the CRM (Stop CRM.cmd, then Start CRM.cmd). You may delete the downloaded client file.')


if __name__ == '__main__':
    main()
