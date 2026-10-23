"""Vercel installs Python packages from pyproject.toml; it must match requirements-backend.txt (test-only pins aside)."""
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TEST_ONLY = {'pytest', 'iniconfig', 'pluggy', 'pygments'}


def _name(pin):
    return pin.split('==')[0].strip().lower().replace('_', '-')


def test_pyproject_matches_backend_requirements():
    lines = (ROOT / 'requirements-backend.txt').read_text(encoding='utf-8').splitlines()
    wanted = {line.strip() for line in lines if line.strip() and not line.startswith('#') and _name(line) not in TEST_ONLY}
    listed = tomllib.loads((ROOT / 'pyproject.toml').read_text(encoding='utf-8'))['project']['dependencies']
    assert {_name(p): p for p in listed} == {_name(p): p for p in wanted}
