"""Turn on "Forgot password?" emails and sign-in codes by email for this laptop's CRM. The person types the mailbox
password at a hidden prompt.

  .venv\\Scripts\\python.exe scripts\\set_recovery_mail.py --email info@mymagppie.com

Defaults suit Google Workspace (smtp.gmail.com, port 587, STARTTLS) and need a Google App Password for that mailbox
(Google Account -> Security -> 2-Step Verification -> App passwords). Before anything is saved, it signs in to the
mail server and sends one test email to the same address. Only then does it write the RECOVERY_* settings,
CRM_RECOVERY_ENABLED=1 and (unless --no-login-codes) CRM_EMAIL_OTP=1 into .env.local. The password is never printed
or logged.
"""
import argparse
import getpass
import smtplib
import ssl
from email.message import EmailMessage
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = ROOT / '.env.local'


def update(text, values):
    lines, seen = text.splitlines(), set()
    for i, line in enumerate(lines):
        key = line.split('=', 1)[0].strip()
        if key in values and not line.lstrip().startswith('#'):
            lines[i] = key + '=' + values[key]
            seen.add(key)
    lines += [key + '=' + value for key, value in values.items() if key not in seen]
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--email', required=True, help='Mailbox that sends the reset links (also the sign-in user)')
    parser.add_argument('--host', default='smtp.gmail.com')
    parser.add_argument('--port', type=int, default=587)
    parser.add_argument('--no-login-codes', action='store_true', help='Only reset emails; no sign-in codes by email')
    args = parser.parse_args()
    if not ENV.exists():
        raise SystemExit('.env.local is missing. Complete local setup first (docs/SETUP.md).')
    email = args.email.strip().lower()
    password = getpass.getpass(f'App password for {email} (hidden): ').replace(' ', '')
    if not password:
        raise SystemExit('No password entered. Nothing was changed.')
    message = EmailMessage()
    message['From'] = email
    message['To'] = email
    message['Subject'] = 'MAGPPIE CRM: password reset email is working'
    message.set_content('This test confirms the CRM can send password reset links from this mailbox. No action needed.')
    try:
        with smtplib.SMTP(args.host, args.port, timeout=20) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(email, password)
            server.send_message(message)
    except smtplib.SMTPAuthenticationError:
        raise SystemExit('The mail server refused the sign-in. Use a Google App Password (not the normal password). '
                         'Nothing was changed.') from None
    except (OSError, smtplib.SMTPException):
        raise SystemExit('Could not reach or use the mail server. Nothing was changed.') from None
    ENV.write_text(update(ENV.read_text(encoding='utf-8'), {
        'CRM_RECOVERY_ENABLED': '1',
        'RECOVERY_SMTP_HOST': args.host,
        'RECOVERY_SMTP_PORT': str(args.port),
        'RECOVERY_SMTP_USER': email,
        'RECOVERY_SMTP_PASSWORD': password,
        'RECOVERY_MAIL_FROM': email,
        'CRM_EMAIL_OTP': '0' if args.no_login_codes else '1',
    }), encoding='utf-8')
    codes = '' if args.no_login_codes else ' and sign-in codes by email'
    print(f'Test email sent to {email}. Reset emails{codes} are on; restart the CRM (Stop CRM.cmd, then Start CRM.cmd).')


if __name__ == '__main__':
    main()
