#!/usr/bin/env python3
"""Builds the online copy: one page with every screen in it, made from the same files the laptop uses.

Run:  python3 online/build.py     (from the crm-claude folder)
It writes online/index.html. Today's saved data goes inside it, locked with the password given in CRM_PASS
(CRM_PASS=... python3 online/build.py). A second password in CRM_PASS_BANK opens a bank-only copy (no tokens, freight or management discount).
Neither password is ever written to any file.
Nothing in the laptop copy is changed.
"""
import json
import base64
import os
import re
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as handle:
        return handle.read()


def scripts(page):
    return [src.lstrip("/") for src in re.findall(r'<script src="([^"]+)"', read(page))]


COMMON = ["shared/kit.js", "shared/people.js", "shared/pin.js", "shared/rules.js", "shared/signals.js"]
PAGES = {"sales": "sales/index.html", "design": "design/index.html", "measurement": "measurement/index.html", "accounts": "accounts/index.html", "management": "management/index.html"}
START = {"sales": "SalesBin.register(); Sales.start();"}

out = []
password = os.environ.get("CRM_PASS", "")
assert password, "give the password in CRM_PASS"
sealed = subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-md", "sha256", "-salt", "-pass", "env:CRM_PASS"],
                        input=read("data/store.json").encode("utf-8"), stdout=subprocess.PIPE, check=True).stdout
assert sealed[:8] == b"Salted__"


def bank_only(store):
    """A copy for the second password: only the money that goes through the bank.
    Tokens, freight and management discount are taken out of the data itself, so they cannot be read back."""
    out = json.loads(json.dumps(store))
    for c in out["clients"]:
        o = c.get("order") or {}
        products = o.get("products") or []
        obv = sum(float(p.get("value") or 0) for p in products) + float(o.get("installation") or 0)
        md = min(obv, max(0.0, float(o.get("md") or 0)))
        keep = (obv - md) / obv if obv else 1.0
        for p in products:
            p["value"] = int(round(float(p.get("value") or 0) * keep))
        if o.get("installation"):
            o["installation"] = int(round(float(o["installation"]) * keep))
        o["md"] = 0
        o["freight"] = 0
        pay = c.get("payment") or {}
        pay["receipts"] = [r for r in pay.get("receipts") or [] if r.get("mode") != "Token" and r.get("kind") != "md"]
        pay.pop("tokenPlan", None)
        pay.pop("tokenBy", None)
        for p in (c.get("design") or {}).get("proposals") or []:
            p["amount"] = int(round(float(p.get("amount") or 0) * keep))
        c["news"] = []
    return out


bank_password = os.environ.get("CRM_PASS_BANK", "")
sealed_bank = b""
if bank_password:
    sealed_bank = subprocess.run(["openssl", "enc", "-aes-256-cbc", "-pbkdf2", "-iter", "200000", "-md", "sha256", "-salt", "-pass", "env:CRM_PASS_BANK"],
                                 input=json.dumps(bank_only(json.loads(read("data/store.json"))), ensure_ascii=False).encode("utf-8"), stdout=subprocess.PIPE, check=True).stdout
GATE = """
#gate { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; background: #f5f5f7; }
.gate-box { width: 320px; max-width: 100%; display: flex; flex-direction: column; gap: 10px; background: #fff; border: 1px solid #e3e3e8; border-radius: 16px; padding: 24px; font: 14px/1.4 -apple-system, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif; color: #1d1d1f; }
.gate-brand { font-weight: 700; letter-spacing: .08em; font-size: 13px; margin-bottom: 6px; } .gate-brand span { font-weight: 400; color: #6e6e73; letter-spacing: 0; }
.gate-box label { font-size: 12px; color: #6e6e73; } .gate-box input { height: 40px; border: 1px solid #d2d2d7; border-radius: 10px; padding: 0 12px; font: inherit; width: 100%; box-sizing: border-box; background: #fff; color: #1d1d1f; }
.gate-box input:focus-visible, .gate-box button:focus-visible { outline: 2px solid #0071e3; outline-offset: 2px; }
.gate-box button { height: 40px; border: 0; border-radius: 10px; background: #1d1d1f; color: #fff; font: inherit; font-weight: 600; cursor: pointer; } .gate-box button:disabled { opacity: .5; }
#gate-msg { min-height: 18px; font-size: 12px; color: #b3261e; }
#online-note { position: fixed; left: 50%; bottom: calc(14px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 9999; background: #1d1d1f; color: #fff; padding: 10px 16px; border-radius: 10px; font: 500 13px/1.3 -apple-system, system-ui, sans-serif; max-width: 90vw; text-align: center; }
"""
out.append("<title>Magppie CRM</title>")
out.append("<style>\nhtml, body { height: 100%; }\nbody { background: #f5f5f7; color: #1d1d1f; }\n" + read("shared/look.css") + GATE + "\n</style>")
out.append('<style id="management-look" media="not all">\n' + read("management/look.css") + "\n</style>")
out.append('<div id="app"></div>')
out.append("<script>\nwindow.CRM_SEALED = " + json.dumps(base64.b64encode(sealed).decode("ascii")) + ";\nwindow.CRM_SEALED_BANK = " + json.dumps(base64.b64encode(sealed_bank).decode("ascii") if sealed_bank else "") + ";\n</script>")
out.append("<script>\n" + open(os.path.join(HERE, "bridge.js"), encoding="utf-8").read() + "\n</script>")
for path in COMMON:
    out.append("<script>\n// " + path + "\n" + read(path) + "\n</script>")
bundles = []
for dept, page in PAGES.items():
    body = "\n".join("// " + p + "\n" + read(p) for p in scripts(page) if p not in COMMON)
    bundles.append(json.dumps(dept) + ": function () {\n" + body + "\n" + START.get(dept, "") + "\n}")
out.append("<script>\nconst CRM_SCREENS = {\n" + ",\n".join(bundles) + "\n};\n"
           "window.CRM_START = function (dept) { CRM_SCREENS[dept](); };\n"
           "OnlineCRM.open().then(function () { OnlineCRM.show(OnlineCRM.dept()); });\n</script>")

page = "\n".join(out)
assert "</script" not in page.replace("</script>\n<script>", "").replace("\n</script>", ""), "a script closes early"
with open(os.path.join(HERE, "index.html"), "w", encoding="utf-8") as handle:
    handle.write(page + "\n")

store = json.loads(read("data/store.json"))
assert password not in page, "the password must not be in the page"
assert not bank_password or bank_password not in page, "the second password must not be in the page"
print("built", len(page), "characters;", len(store["clients"]), "clients sealed inside, rev", store.get("rev"))
