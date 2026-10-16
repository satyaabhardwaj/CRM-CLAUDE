"""WhatsApp through TimelinesAI: read the chat with one phone number, and send a text to it.
The token is read from whatsapp/keys.env. Standard library only."""
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://app.timelines.ai/integrations/api"


class NoKey(Exception):
    pass


class Failed(Exception):
    pass


def token():
    path = os.path.join(HERE, "keys.env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                if line.strip().startswith("TIMELINES_TOKEN="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


def ready():
    return bool(token())


def number(phone):
    """A phone as WhatsApp wants it: +91 in front of a plain ten digit Indian number."""
    digits = re.sub(r"[^0-9]", "", str(phone or ""))
    if len(digits) == 10:
        digits = "91" + digits
    if len(digits) == 11 and digits.startswith("0"):
        digits = "91" + digits[1:]
    return "+" + digits if len(digits) >= 11 else ""


def call(path, body=None):
    key = token()
    if not key:
        raise NoKey()
    data = json.dumps(body).encode("utf-8") if body is not None else None
    ask = urllib.request.Request(BASE + path, data=data, headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(ask, timeout=25) as answer:
            return json.load(answer)
    except urllib.error.HTTPError as problem:
        try:
            said = json.load(problem).get("message") or ""
        except ValueError:
            said = ""
        raise Failed(said or "TimelinesAI said no (" + str(problem.code) + ").")
    except (urllib.error.URLError, OSError, ValueError):
        raise Failed("Could not reach TimelinesAI. Check the internet.")


def when(stamp):
    """TimelinesAI's time, as the ISO time the CRM keeps."""
    text = str(stamp or "").strip()
    for shape in ("%Y-%m-%d %H:%M:%S %z", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%S.%f%z", "%Y-%m-%d %H:%M:%S"):
        try:
            at = datetime.strptime(text, shape)
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            return at.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        except ValueError:
            continue
    return text


def chat(phone):
    """The chat with this phone number, oldest message first. No chat yet is an empty list."""
    to = number(phone)
    if not to:
        raise Failed("This client has no usable phone number.")
    found = (call("/chats?phone=" + urllib.parse.quote(to)).get("data") or {}).get("chats") or []
    found = [c for c in found if not c.get("is_group")]
    if not found:
        return {"phone": to, "messages": []}
    got = (call("/chats/" + str(found[0]["id"]) + "/messages").get("data") or {}).get("messages") or []
    out = [{"uid": m.get("uid"), "at": when(m.get("timestamp")), "mine": bool(m.get("from_me")), "text": m.get("text") or "",
            "file": m.get("attachment_filename") or "", "status": m.get("status") or ""} for m in got]
    out.sort(key=lambda m: m["at"])
    return {"phone": to, "messages": out[-60:]}


def send(phone, text):
    to = number(phone)
    if not to:
        raise Failed("This client has no usable phone number.")
    if not str(text or "").strip():
        raise Failed("Nothing to send.")
    call("/messages", {"phone": to, "text": str(text).strip()[:4000]})
    return {"ok": True}
