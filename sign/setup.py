#!/usr/bin/env python3
"""One-time setup for Zoho Sign. Run:  python3 sign/setup.py

It asks three things, turns the short-lived code into a lasting key, and writes sign/keys.env for you.
What you paste is not shown on screen and is saved only in that file on this laptop.
"""
import getpass
import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.abspath(__file__))

print("\nZoho Sign setup. Paste each item and press Enter. What you paste will not show on screen.\n")
client_id = getpass.getpass("1. Client ID: ").strip()
client_secret = getpass.getpass("2. Client Secret: ").strip()
code = getpass.getpass("3. The code from Generate Code: ").strip()
test_email = "info@mymagppie.com"
dc = "in"

if not (client_id and client_secret and code):
    raise SystemExit("\nStopped: the Client ID, Client Secret and code are all needed. Nothing was saved.")

query = urlencode({"code": code, "client_id": client_id, "client_secret": client_secret, "grant_type": "authorization_code"})
try:
    with urlopen(Request("https://accounts.zoho.%s/oauth/v2/token?%s" % (dc, query), data=b"", method="POST"), timeout=60) as answer:
        out = json.loads(answer.read())
except (HTTPError, URLError, OSError, ValueError) as problem:
    raise SystemExit("\nZoho could not be reached: %s\nNothing was saved." % problem)

if not out.get("refresh_token"):
    reason = out.get("error", "no reason given")
    hint = " The code lasts only a few minutes and works once. Press Generate Code again and rerun this." if reason in ("invalid_code", "invalid_client") else ""
    raise SystemExit("\nZoho did not accept it (%s).%s\nNothing was saved." % (reason, hint))

with open(os.path.join(HERE, "keys.env"), "w", encoding="utf-8") as handle:
    handle.write("# Written by sign/setup.py. Keep this file on this laptop only.\n")
    handle.write("ZOHO_SIGN_CLIENT_ID=%s\nZOHO_SIGN_CLIENT_SECRET=%s\nZOHO_SIGN_REFRESH_TOKEN=%s\nZOHO_DC=%s\n" % (client_id, client_secret, out["refresh_token"], dc))
    handle.write("\n# TEST MODE: while this is filled in, every document goes here and never to the client. Clear it to go live.\nSIGN_TEST_EMAIL=%s\n" % test_email)
    handle.write("\n# Optional: the Magppie person who signs after the client.\nSIGN_MAGPPIE_NAME=\nSIGN_MAGPPIE_EMAIL=\n")
os.chmod(os.path.join(HERE, "keys.env"), 0o600)
print("\nDone. Zoho Sign is switched on%s." % (" in TEST MODE, sending only to " + test_email if test_email else ""))
print("You do not need to restart anything. Go back to the CRM and press Send for signature.\n")
