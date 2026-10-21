#!/usr/bin/env python3
"""The engine. It serves the screens and keeps the saved data.

It names no stage, no field and no dashboard. It only serves the folders
and reads or writes data/store.json. Python standard library only.
"""
import base64
import json
import urllib.parse
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote
from pathlib import Path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
STORE = os.path.join(DATA, "store.json")
SEED = os.path.join(DATA, "seed.json")
UPLOADS = os.path.join(DATA, "uploads")
PORT = int(os.environ.get("PORT", "4300"))
# A second copy of the engine can serve another front page on another port, read only.
HOME_PAGE = os.environ.get("HOME_PAGE", "/sales/")
READ_ONLY = os.environ.get("READ_ONLY", "") == "1"
UNSAFE = re.compile(r"[^A-Za-z0-9._ -]")
MAX_STORE = 5 * 1024 * 1024
MAX_UPLOAD = 25 * 1024 * 1024
MAX_SOUND = 20 * 1024 * 1024
# The AI agents live in their own folder. The engine only passes requests to them.
sys.path.insert(0, ROOT)
from core import security, storage
from ai.agents import transcriber  # noqa: E402
from sign import zoho_sign  # noqa: E402
from mail import send as mailer  # noqa: E402


def problem_to_json(problem):
    return problem[0], {"error": problem[1]}


def safe_name(text):
    return UNSAFE.sub("_", str(text or "")).strip(". ")


def load_store():
    for source in (STORE, SEED):
        try:
            with open(source, "rb") as handle:
                return json.load(handle)
        except FileNotFoundError:
            continue
    # A fresh checkout can open without creating a data folder.
    return {"rev": 0, "clients": []}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(60)

    def parse_request(self):
        if not super().parse_request():
            return False
        problem = security.authorize(self)
        if problem:
            if problem[0] == 401:
                self.send_response(401)
                self.send_header("WWW-Authenticate", 'Basic realm="MAGPPIE CRM"')
                self.end_headers()
            else:
                self.reply(*problem_to_json(problem))
            return False
        if self.command in ('PUT', 'POST'):
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size < 0 or size > MAX_UPLOAD or self.headers.get('Transfer-Encoding'):
                    raise ValueError()
            except ValueError:
                self.reply(413, {"error": "Invalid or excessive request size."})
                return False
        return True

    def list_directory(self, path):
        self.send_error(404)
        return None

    def send_head(self):
        path = self.translate_path(self.path)
        if not security.public_file(ROOT, path):
            self.send_error(404)
            return None
        if Path(path).resolve().is_relative_to(Path(UPLOADS).resolve()):
            self._attachment = True
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "DENY")
        if getattr(self, '_attachment', False):
            self.send_header("Content-Disposition", "attachment")
            self.send_header("Content-Security-Policy", "sandbox")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, obj):
        body = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/health":
            try:
                storage.validate(load_store())
                return self.reply(200, {"status": "ok", "schemaVersion": 1})
            except (ValueError, OSError):
                return self.reply(503, {"status": "unavailable"})
        if path == "/api/store":
            try:
                return self.reply(200, load_store())
            except (ValueError, OSError):
                return self.reply(503, {"error": "Saved data is unavailable. Contact the administrator."})
        if path == "/api/ai/status":
            return self.reply(200, {"transcriber": transcriber.ready()})
        if path == "/api/sign/status":
            ask = self.path.split("?", 1)[1] if "?" in self.path else ""
            request_id = re.sub(r"[^0-9A-Za-z]", "", ask.replace("id=", ""))
            if not request_id:
                return self.reply(200, zoho_sign.status_line())
            try:
                return self.reply(200, zoho_sign.status(request_id))
            except (ValueError, TypeError):
                return self.reply(400, {"error": "Invalid signature request."})
            except zoho_sign.NoKey:
                return self.reply(503, {"error": "no key"})
            except zoho_sign.Failed as problem:
                return self.reply(502, {"error": str(problem)})
        # The keys for the AI and signing services never leave this laptop.
        if path.startswith("/ai/") or path.startswith("/sign/") or path.startswith("/mail/") or path.startswith("/whatsapp/") or path.startswith("/crawler/") or path.startswith("/vercel/"):
            return self.reply(404, {"error": "not found"})
        if path == "/":
            self.send_response(302)
            self.send_header("Location", HOME_PAGE)
            self.end_headers()
            return
        super().do_GET()

    def do_PUT(self):
        if READ_ONLY:
            return self.reply(403, {"error": "read only"})
        path = self.path.split("?")[0]
        size = int(self.headers.get("Content-Length", "0") or 0)
        if path == "/api/store":
            if size > MAX_STORE:
                return self.reply(413, {"error": "too large"})
            raw = self.rfile.read(size)
            try:
                incoming = json.loads(raw)
            except ValueError:
                return self.reply(400, {"error": "not json"})
            try:
                storage.validate(incoming)
                with storage.LOCK:
                    current = load_store().get("rev", 0)
                    if incoming["rev"] != current:
                        return self.reply(409, {"error": "stale", "rev": current})
                    storage.commit(STORE, incoming, current)
                return self.reply(200, {"ok": True, "rev": current + 1})
            except ValueError:
                return self.reply(400, {"error": "Invalid store structure."})
            except OSError:
                return self.reply(503, {"error": "Save failed. Your changes have not been saved."})
        if path.startswith("/api/upload/"):
            parts = [unquote(p) for p in path[len("/api/upload/"):].split("/")]
            if len(parts) != 2 or size > MAX_UPLOAD:
                return self.reply(400, {"error": "bad upload"})
            owner, name = safe_name(parts[0]), safe_name(parts[1])
            if not owner or not name or owner not in {str(c.get("id")) for c in load_store().get("clients", [])}:
                return self.reply(400, {"error": "bad name"})
            folder = os.path.join(UPLOADS, owner)
            os.makedirs(folder, exist_ok=True)
            with open(os.path.join(folder, name), "wb") as handle:
                handle.write(self.rfile.read(size))
            return self.reply(200, {"ok": True, "name": name})
        self.reply(404, {"error": "not found"})

    def do_POST(self):
        if READ_ONLY:
            return self.reply(403, {"error": "read only"})
        if self.path.split("?")[0] in ("/api/sign/send", "/api/sign/fetch"):
            size = int(self.headers.get("Content-Length", "0") or 0)
            try:
                ask = json.loads(self.rfile.read(size))
                if not isinstance(ask, dict):
                    raise ValueError("Expected an object")
            except ValueError:
                return self.reply(400, {"error": "not json"})
            try:
                if self.path.split("?")[0] == "/api/sign/send":
                    if not all(isinstance(ask.get(key, ""), str) for key in ("email", "pdf", "filename", "title", "name")):
                        return self.reply(400, {"error": "Invalid signature request."})
                    if not ask.get("email"):
                        return self.reply(400, {"error": "The client's email is needed to send for signature."})
                    return self.reply(200, zoho_sign.send(base64.b64decode(ask.get("pdf", ""), validate=True), safe_name(ask.get("filename", "document.pdf")),
                                                          ask.get("title", "Document"), ask.get("name", ""), ask["email"], ask.get("marks") or []))
                if not isinstance(ask.get("id"), str) or not isinstance(ask.get("owner"), str) or ask["owner"] not in {str(c.get("id")) for c in load_store().get("clients", [])}:
                    return self.reply(400, {"error": "A valid client and signature request are required."})
                # Fetch the signed copy and keep it with the client's other files.
                owner = safe_name(ask.get("owner", ""))
                name = "signed-" + safe_name(ask.get("filename", "document.pdf"))
                pdf = zoho_sign.signed_pdf(re.sub(r"[^0-9A-Za-z]", "", ask.get("id", "")))
                folder = os.path.join(UPLOADS, owner)
                os.makedirs(folder, exist_ok=True)
                with open(os.path.join(folder, name), "wb") as handle:
                    handle.write(pdf)
                return self.reply(200, {"ok": True, "name": name})
            except (ValueError, TypeError):
                return self.reply(400, {"error": "Invalid signature request."})
            except zoho_sign.NoKey:
                return self.reply(503, {"error": "no key"})
            except zoho_sign.Failed as problem:
                return self.reply(502, {"error": str(problem)})
        if self.path.split("?")[0] == "/api/mail/send":
            size = int(self.headers.get("Content-Length", "0") or 0)
            try:
                ask = json.loads(self.rfile.read(size))
                if not isinstance(ask, dict):
                    raise ValueError("Expected an object")
                return self.reply(200, mailer.send(str(ask.get("kind", "")), str(ask.get("subject", ""))[:200], str(ask.get("body", ""))[:5000]))
            except ValueError:
                return self.reply(400, {"error": "not json"})
            except mailer.NoKey:
                return self.reply(503, {"error": "no key"})
            except mailer.Failed as problem:
                return self.reply(502, {"error": str(problem)})
        if self.path.split("?")[0] == "/api/ai/transcribe":
            size = int(self.headers.get("Content-Length", "0") or 0)
            if not size or size > MAX_SOUND:
                return self.reply(400, {"error": "The recording is empty or longer than this can take."})
            sound = self.rfile.read(size)
            kind = self.headers.get("Content-Type", "audio/webm").split(";")[0]
            ending = {"audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg"}.get(kind, "webm")
            try:
                return self.reply(200, {"text": transcriber.transcribe(sound, "note." + ending, kind)})
            except transcriber.NoKey:
                return self.reply(503, {"error": "no key"})
            except transcriber.Failed as problem:
                return self.reply(502, {"error": str(problem)})
        if self.path.split("?")[0] == "/api/reset":
            return self.reply(403, {"error": "Reset is disabled. Use the documented offline recovery procedure."})
        self.reply(404, {"error": "not found"})


if __name__ == "__main__":
    if os.environ.get('CRM_ENV', 'development') != 'development':
        raise SystemExit('This local server is not a production host. See docs/OPERATIONS.md.')
    print("Magppie CRM (Claude) is running at http://127.0.0.1:%d/" % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
