"""The transcriber agent: a recorded voice note in, the words out.

It sends the sound to a Whisper model and returns the text. The key is read from ai/keys.env on this laptop.
Groq is tried first because it has a free tier; OpenAI is used if only that key is there.
Python standard library only.
"""
import json
import os
import uuid
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SERVICES = [
    ("GROQ_API_KEY", "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3"),
    ("OPENAI_API_KEY", "https://api.openai.com/v1/audio/transcriptions", "whisper-1"),
]


class NoKey(Exception):
    pass


class Failed(Exception):
    pass


def keys():
    """The keys in ai/keys.env, or in the environment the engine was started with."""
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
    for name, _, _ in SERVICES:
        if os.environ.get(name):
            found.setdefault(name, os.environ[name])
    return found


def ready():
    have = keys()
    return any(name in have for name, _, _ in SERVICES)


def transcribe(sound, filename="note.webm", kind="audio/webm"):
    """Send the recorded sound to the model and return the words."""
    have = keys()
    service = next(((have[name], url, model) for name, url, model in SERVICES if name in have), None)
    if not service:
        raise NoKey()
    key, url, model = service
    edge = "----magppie" + uuid.uuid4().hex
    parts = []
    for name, value in (("model", model), ("response_format", "json")):
        parts.append(("--%s\r\nContent-Disposition: form-data; name=\"%s\"\r\n\r\n%s\r\n" % (edge, name, value)).encode("utf-8"))
    parts.append(("--%s\r\nContent-Disposition: form-data; name=\"file\"; filename=\"%s\"\r\nContent-Type: %s\r\n\r\n" % (edge, filename, kind)).encode("utf-8"))
    parts.append(sound)
    parts.append(("\r\n--%s--\r\n" % edge).encode("utf-8"))
    request = Request(url, data=b"".join(parts), method="POST", headers={
        "Authorization": "Bearer " + key,
        "Content-Type": "multipart/form-data; boundary=" + edge,
        "User-Agent": "magppie-crm",
    })
    try:
        with urlopen(request, timeout=90) as answer:
            return (json.loads(answer.read()).get("text") or "").strip()
    except HTTPError as problem:
        try:
            detail = json.loads(problem.read()).get("error", {}).get("message", "")
        except (ValueError, AttributeError):
            detail = ""
        raise Failed("The transcription service answered %d. %s" % (problem.code, detail))
    except (URLError, OSError, ValueError) as problem:
        raise Failed("The transcription service could not be reached. %s" % problem)
