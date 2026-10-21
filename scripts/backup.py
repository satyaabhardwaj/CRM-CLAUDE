"""Offline backup only: stop the server first. Never restores or overwrites data."""
import argparse
import datetime
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from core.storage import validate

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--server-stopped', action='store_true', required=True)
parser.add_argument('--destination', type=Path, required=True)
args = parser.parse_args()
source = ROOT / 'data'
validate(json.loads((source/'store.json').read_text(encoding='utf-8')))
destination = args.destination.resolve()
if destination.is_relative_to(source.resolve()):
    parser.error('Choose a backup directory outside data/.')
destination.mkdir(parents=True, exist_ok=True)
output = destination / ('crm-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.zip')
with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source.rglob('*')):
        if path.is_file() and not path.is_symlink():
            archive.write(path, path.relative_to(ROOT))
print('Backup created. Store securely; it contains confidential client data.')
