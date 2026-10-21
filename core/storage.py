"""Versioned JSON repository. One server process owns a data directory."""
import json
import os
import shutil
import threading
from pathlib import Path

LOCK = threading.RLock()
SCHEMA_VERSION = 1


def validate(value):
    if not isinstance(value, dict) or type(value.get("rev")) is not int or value["rev"] < 0:
        raise ValueError("A non-negative revision is required.")
    if value.get("schemaVersion", 1) != SCHEMA_VERSION:
        raise ValueError("Unsupported data schema version.")
    clients = value.get("clients")
    if not isinstance(clients, list):
        raise ValueError("Clients must be a list.")
    ids = set()
    for client in clients:
        if not isinstance(client, dict) or not isinstance(client.get("id"), str) or not client["id"]:
            raise ValueError("Each client needs an ID.")
        if client["id"] in ids:
            raise ValueError("Duplicate client ID.")
        ids.add(client["id"])
    return value


def commit(path, incoming, current):
    """Caller holds LOCK across read/check/write. Keep last known-good revision."""
    validate(incoming)
    incoming = dict(incoming, rev=current + 1, schemaVersion=SCHEMA_VERSION)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8') as handle:
        json.dump(incoming, handle, ensure_ascii=False, indent=1, allow_nan=False)
        handle.flush()
        os.fsync(handle.fileno())
    if path.exists():
        shutil.copy2(path, path.with_suffix('.previous.json'))
    os.replace(temp, path)
