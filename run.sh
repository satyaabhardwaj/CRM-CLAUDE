#!/usr/bin/env bash
# Starts the CRM on this Mac. Open http://127.0.0.1:4300/ after it starts.
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONDONTWRITEBYTECODE=1
exec python3 core/server.py
