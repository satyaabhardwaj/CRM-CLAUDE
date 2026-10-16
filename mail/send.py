"""Sends the CRM's own emails through the company mailbox. Keys are read from mail/keys.env. Standard library only."""
import os
import smtplib
import ssl
from email.message import EmailMessage

HERE = os.path.dirname(os.path.abspath(__file__))


class NoKey(Exception):
    pass


class Failed(Exception):
    pass


def settings():
    found = {}
    path = os.path.join(HERE, "keys.env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    name, value = line.split("=", 1)
                    if value.strip():
                        found[name.strip()] = value.strip().strip('"').strip("'")
    return found


def ready():
    s = settings()
    return all(s.get(k) for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"))


def send(kind, subject, body):
    """kind says who it is for. Only 'factory' exists so far."""
    s = settings()
    if not ready():
        raise NoKey()
    to = s.get("MAIL_TEST_EMAIL") or {"factory": s.get("FACTORY_EMAIL", "")}.get(kind, "")
    people = [x.strip() for x in to.split(",") if x.strip()]
    if not people:
        raise Failed("No address is set for the %s email." % kind)
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = s.get("MAIL_FROM") or s["SMTP_USER"]
    message["To"] = ", ".join(people)
    message.set_content(body)
    try:
        with smtplib.SMTP(s["SMTP_HOST"], int(s.get("SMTP_PORT", "587")), timeout=30) as server:
            server.starttls(context=ssl.create_default_context())
            server.login(s["SMTP_USER"], s["SMTP_PASSWORD"])
            server.send_message(message)
    except (smtplib.SMTPException, OSError) as problem:
        raise Failed("The email could not be sent. %s" % problem)
    return {"sent": True, "to": people, "test": bool(s.get("MAIL_TEST_EMAIL"))}
