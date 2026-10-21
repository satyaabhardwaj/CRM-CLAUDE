@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo CRM Python environment is missing. See docs\SETUP.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -B scripts\stop_local.py
pause
