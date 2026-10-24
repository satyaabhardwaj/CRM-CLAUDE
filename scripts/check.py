"""Dependency-free validation; never reads production data or calls providers."""
import os
import ast
import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
def sources(suffix):
    for folder, directories, files in os.walk(ROOT):
        directories[:] = [d for d in directories if d not in {'backup', '.git', '.venv', '.local', 'node_modules', 'dist', '__pycache__'}]
        for name in files:
            if name.endswith(suffix):
                yield pathlib.Path(folder) / name

for path in sources('.py'):
    if not any(p in {'backup', '.git', '.venv'} for p in path.parts):
        ast.parse(path.read_text(encoding='utf-8-sig'), filename=str(path))
javascript = [str(path) for path in sources('.js') if path != ROOT / 'sales/react/src/reports.js' and 'vendor' not in path.parts and path.parent not in {ROOT / 'measurement' / 'assets', ROOT / 'accounts' / 'assets', ROOT / 'sales' / 'assets', ROOT / 'design' / 'assets', ROOT / 'management' / 'assets', ROOT / 'backend' / 'web' / 'assets'}]
# Sales reports.js is an ES module checked by the Sales Vite build.
# These are classic browser scripts. Parse without execution in one Node process.
subprocess.run(['node', '-e', "const fs=require('fs'),vm=require('vm'); for(const file of JSON.parse(fs.readFileSync(0,'utf8'))) new vm.Script(fs.readFileSync(file,'utf8'),{filename:file});"], input=json.dumps(javascript), text=True, check=True, cwd=ROOT)
print('PASS: Python syntax and ' + str(len(javascript)) + ' JavaScript files.', flush=True)
for command in ([sys.executable,'-B','-m','unittest','discover','-s','tests'], [sys.executable,'-B','-m','unittest','discover','-s','measurement/tests'], ['node','--test','measurement/tests/model.test.cjs','tests/runtime.test.cjs']):
    subprocess.run(command, check=True, cwd=ROOT)
print('PASS: Python/JavaScript syntax, foundation and Measurement checks.')
