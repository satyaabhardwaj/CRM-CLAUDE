"""Zoho Sign: send a PDF for signature, ask how it is going, and fetch the signed copy.

Keys are read from sign/keys.env on this laptop. Python standard library only.
"""
import json
import os
import uuid
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

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
    return all(s.get(k) for k in ("ZOHO_SIGN_CLIENT_ID", "ZOHO_SIGN_CLIENT_SECRET", "ZOHO_SIGN_REFRESH_TOKEN"))


def status_line():
    """What the screen may know: whether it is on, and whether it is in test mode. Never the keys."""
    s = settings()
    return {"on": ready(), "test": bool(s.get("SIGN_TEST_EMAIL")), "second_signer": bool(s.get("SIGN_MAGPPIE_EMAIL"))}


def call(request):
    try:
        with urlopen(request, timeout=90) as answer:
            return answer.read()
    except HTTPError as problem:
        body = problem.read()
        try:
            detail = json.loads(body).get("message", "")
        except (ValueError, AttributeError):
            detail = ""
        raise Failed("Zoho Sign answered %d. %s" % (problem.code, detail))
    except (URLError, OSError) as problem:
        raise Failed("Zoho Sign could not be reached. %s" % problem)


def token(s):
    """A short-lived pass, made from the refresh token each time. It is not stored."""
    if not ready():
        raise NoKey()
    dc = s.get("ZOHO_DC", "in")
    query = urlencode({"refresh_token": s["ZOHO_SIGN_REFRESH_TOKEN"], "client_id": s["ZOHO_SIGN_CLIENT_ID"],
                       "client_secret": s["ZOHO_SIGN_CLIENT_SECRET"], "grant_type": "refresh_token"})
    out = json.loads(call(Request("https://accounts.zoho.%s/oauth/v2/token?%s" % (dc, query), data=b"", method="POST")))
    if not out.get("access_token"):
        raise Failed("Zoho did not accept the keys. %s" % out.get("error", ""))
    return out["access_token"], "https://sign.zoho.%s/api/v1" % dc


def multipart(fields, file=None):
    edge = "----magppie" + uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (edge, name, value)).encode("utf-8"))
    if file:
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: application/pdf\r\n\r\n" % (edge, file[0])).encode("utf-8"))
        parts.append(file[1])
        parts.append(b"\r\n")
    parts.append(("--%s--\r\n" % edge).encode("utf-8"))
    return b"".join(parts), "multipart/form-data; boundary=" + edge


def send(pdf, filename, title, client_name, client_email, marks):
    """Create the request, place the signature boxes, and send it.

    marks: where the signature lines are on the PDF, as
           [{"who": "client" | "magppie", "page": 0, "x": .., "y": .., "w": .., "h": ..}], in points from the top left.
    """
    s = settings()
    access, base = token(s)
    head = {"Authorization": "Zoho-oauthtoken " + access, "User-Agent": "magppie-crm"}
    test = s.get("SIGN_TEST_EMAIL", "")
    people = [("client", client_name, test or client_email)]
    if s.get("SIGN_MAGPPIE_EMAIL"):
        people.append(("magppie", s.get("SIGN_MAGPPIE_NAME") or "Magppie Sales", test or s["SIGN_MAGPPIE_EMAIL"]))
    actions = [{"recipient_name": name, "recipient_email": email, "action_type": "SIGN", "signing_order": i + 1,
                "verify_recipient": False, "private_notes": ""} for i, (_, name, email) in enumerate(people)]
    made = {"requests": {"request_name": title, "is_sequential": True, "expiration_days": 15, "email_reminders": True,
                         "reminder_period": 3, "actions": actions}}
    body, kind = multipart({"data": json.dumps(made)}, (filename, pdf))
    out = json.loads(call(Request(base + "/requests", data=body, method="POST", headers=dict(head, **{"Content-Type": kind}))))
    req = out.get("requests") or {}
    if not req.get("request_id"):
        raise Failed("Zoho Sign did not create the request. %s" % out.get("message", ""))
    document = (req.get("document_ids") or [{}])[0].get("document_id")
    placed = []
    for i, (who, name, email) in enumerate(people):
        action = (req.get("actions") or [])[i]
        boxes = [{"field_type_name": "Signature", "field_name": "Signature", "field_label": "Signature", "is_mandatory": True,
                  "document_id": document, "action_id": action["action_id"], "page_no": int(m["page"]),
                  "x_coord": int(m["x"]), "y_coord": int(m["y"]), "abs_width": int(m["w"]), "abs_height": int(m["h"])}
                 for m in marks if m.get("who") == who]
        placed.append({"action_id": action["action_id"], "recipient_name": name, "recipient_email": email, "action_type": "SIGN",
                       "fields": {"image_fields": boxes}})
    body, kind = multipart({"data": json.dumps({"requests": {"actions": placed}})})
    out = json.loads(call(Request(base + "/requests/%s/submit" % req["request_id"], data=body, method="POST", headers=dict(head, **{"Content-Type": kind}))))
    if out.get("status") != "success":
        raise Failed("Zoho Sign did not send it. %s" % out.get("message", ""))
    return {"id": req["request_id"], "sent_to": [email for _, _, email in people], "test": bool(test)}


def status(request_id):
    access, base = token(settings())
    out = json.loads(call(Request(base + "/requests/%s" % request_id, headers={"Authorization": "Zoho-oauthtoken " + access})))
    req = out.get("requests") or {}
    return {"status": req.get("request_status", "unknown"),
            "people": [{"name": a.get("recipient_name"), "status": a.get("action_status")} for a in req.get("actions") or []]}


def signed_pdf(request_id):
    access, base = token(settings())
    return call(Request(base + "/requests/%s/pdf" % request_id, headers={"Authorization": "Zoho-oauthtoken " + access}))
