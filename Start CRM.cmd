@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo CRM Python environment is missing. See docs\VERCEL_SUPABASE.md.
  pause
  exit /b 1
)
".venv\Scripts\python.exe" -B scripts\launch_local.py
if errorlevel 1 pause
