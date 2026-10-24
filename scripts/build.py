"""Create a deterministic source release, excluding data, secrets and legacy backups."""
import os
import hashlib
from pathlib import Path
import zipfile
import argparse

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = {'backend','core','shared','sales','design','accounts','management','measurement','ai','sign','mail','tests','scripts','docs','.github','deploy','supabase'}
EXTENSIONS = {'.py','.ts','.tsx','.js','.cjs','.mjs','.css','.html','.md','.svg','.png','.jpg','.jpeg','.gif','.woff','.woff2','.geojson','.yml','.toml','.sql'}
FILES = {'requirements-backend.txt','requirements.txt','alembic.ini','Start CRM.cmd','Stop CRM.cmd','backend.env.example','README.md','CLAUDE.md','CHANGELOG.md','.env.example','.env.local.example','.gitignore','Dockerfile','.dockerignore','.vercelignore','.python-version','pyproject.toml','vercel.json','docker-compose.yml','package.json','package-lock.json'}
if not (ROOT / 'measurement/assets/app.js').is_file():
    raise SystemExit('Build Measurement first: npm ci --prefix measurement/react; npm run build --prefix measurement/react')
if not (ROOT / 'accounts/assets/app.js').is_file():
    raise SystemExit('Build Accounts first: npm ci --prefix accounts/react; npm run build --prefix accounts/react')
if not (ROOT / 'sales/assets/app.js').is_file():
    raise SystemExit('Build Sales first: npm ci --prefix sales/react; npm run build --prefix sales/react')
if not (ROOT / 'design/assets/app.js').is_file():
    raise SystemExit('Build Design first: npm ci --prefix design/react; npm run build --prefix design/react')
if not (ROOT / 'management/assets/app.js').is_file():
    raise SystemExit('Build Management first: npm ci --prefix management/react; npm run build --prefix management/react')
if not (ROOT / 'backend/web/assets/login.js').is_file():
    raise SystemExit('Build Auth first: npm ci --prefix backend/react; npm run build --prefix backend/react')
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--output', type=Path, default=ROOT / 'dist' / 'crm-source.zip')
output = parser.parse_args().output.resolve()
output.parent.mkdir(exist_ok=True)
def source_files():
    for folder, directories, files in os.walk(ROOT):
        directories[:] = [d for d in directories if d not in {'.git', '.local', '.venv', '__pycache__', 'node_modules', 'dist', 'backup', 'data', '.temp', '.branches'}]
        for name in files:
            yield Path(folder) / name

with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(source_files()):
        rel = path.relative_to(ROOT)
        if not path.is_file() or path.is_symlink():
            continue
        if str(rel) not in FILES and not (rel.parts[0] in FOLDERS and (path.suffix in EXTENSIONS or path.name.endswith('.env.example') or 'LICENSE' in path.name or path.name == '.gitignore' or (rel.parts[:2] in {('measurement', 'react'), ('accounts', 'react'), ('sales', 'react'), ('design', 'react'), ('management', 'react'), ('backend', 'react')} and path.name in {'package.json','package-lock.json','tsconfig.json'}))):
            continue
        if any(p in {'__pycache__','.venv','node_modules'} for p in rel.parts):
            continue
        info = zipfile.ZipInfo(rel.as_posix(), date_time=(2026,1,1,0,0,0))
        info.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(info, path.read_bytes())
print('Built ' + str(output) + ' SHA256 ' + hashlib.sha256(output.read_bytes()).hexdigest())
