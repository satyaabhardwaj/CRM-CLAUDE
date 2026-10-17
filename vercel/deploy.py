"""Put the online copy of the CRM (online/index.html) on Vercel, account info@mymagppie.com.
Run after `python3 online/build.py`:   python3 vercel/deploy.py
The token is read from vercel/keys.env. Standard library only."""
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEAM = "team_3kNUUimkx3oLM7Mfudka1f6S"   # Magppie Silverstone Pvt Ltd
# Two sites from the same page:
#   magppie-crm        the full version (WhatsApp mirror, Windows helper, watchdog)
#   magppie-crm-local  works like the laptop copy (the WhatsApp button just opens the chat in the WhatsApp app)
# Which one behaves how is decided by the web address, in sales/whatsapp/chat.js.
# Run:  python3 vercel/deploy.py            -> both sites
#       python3 vercel/deploy.py magppie-crm-local  -> only that one
PROJECTS = ["magppie-crm", "magppie-crm-helper"]   # magppie-crm-helper: same page, WhatsApp helper switched on (by address)
PROJECT = "magppie-crm"
API = "https://api.vercel.com"


def token():
    if os.environ.get("VERCEL_TOKEN"):
        return os.environ["VERCEL_TOKEN"].strip()
    path = os.path.join(HERE, "keys.env")
    if os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            if line.strip().startswith("VERCEL_TOKEN="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def call(method, path, body=None, raw=None, headers=None):
    data = raw if raw is not None else (json.dumps(body).encode("utf-8") if body is not None else None)
    ask = urllib.request.Request(API + path, data=data, method=method,
                                 headers=dict({"Authorization": "Bearer " + token(), "Content-Type": "application/json"}, **(headers or {})))
    try:
        with urllib.request.urlopen(ask, timeout=120) as answer:
            text = answer.read()
            return json.loads(text) if text else {}
    except urllib.error.HTTPError as problem:
        said = problem.read().decode("utf-8", "replace")[:300]
        sys.exit("Vercel said no (" + str(problem.code) + "): " + said)


def main():
    if not token():
        sys.exit("No Vercel token yet. Put it in vercel/keys.env.")
    page = open(os.path.join(ROOT, "online", "index.html"), "rb").read()
    files = {"index.html": page,
             "vercel.json": json.dumps({"headers": [{"source": "/(.*)", "headers": [
                 {"key": "X-Robots-Tag", "value": "noindex, nofollow"},
                 {"key": "Cache-Control", "value": "no-cache"}]}]}).encode("utf-8")}
    listed = []
    for name, body in files.items():
        digest = hashlib.sha1(body).hexdigest()
        call("POST", "/v2/files?teamId=" + TEAM, raw=body,
             headers={"Content-Type": "application/octet-stream", "x-vercel-digest": digest, "Content-Length": str(len(body))})
        listed.append({"file": name, "sha": digest, "size": len(body)})
    made = call("POST", "/v13/deployments?teamId=" + TEAM + "&skipAutoDetectionConfirmation=1",
                {"name": PROJECT, "project": PROJECT, "target": "production", "files": listed,
                 "projectSettings": {"framework": None, "buildCommand": None, "outputDirectory": None, "installCommand": None}})
    print("Sent. Deployment", made.get("id"), "state", made.get("readyState"))
    print("Address: https://" + PROJECT + ".vercel.app  (also https://" + str(made.get("url")) + ")")


if __name__ == "__main__":
    for name in (sys.argv[1:] or PROJECTS):
        if name not in PROJECTS:
            sys.exit("Unknown site: " + name)
        PROJECT = name
        main()
