@echo off
cd /d "%~dp0"
.venv\Scripts\python -B scripts/run_backend.py
if errorlevel 1 pause
