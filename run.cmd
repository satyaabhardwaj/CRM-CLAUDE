@echo off
cd /d "%~dp0"
title MAGPPIE CRM - Local Server
echo Starting MAGPPIE CRM at http://127.0.0.1:4300/measurement/
echo Keep this window open while using the app. Press Ctrl+C to stop.
python -B measurement/server.py
if errorlevel 1 (
  echo.
  echo CRM could not start. Check the error above. If port 4300 is already in use, the app may already be running.
  pause
)
