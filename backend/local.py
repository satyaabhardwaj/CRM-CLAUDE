"""Load ignored local settings, or use exported environment variables."""
import os
from pathlib import Path

def load():
    root=Path(__file__).resolve().parents[1]
    env=root/'.env.local'
    if env.exists():
        for line in env.read_text(encoding='utf-8').splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key,value=line.split('=',1)
                os.environ.setdefault(key.strip(),value.strip())
