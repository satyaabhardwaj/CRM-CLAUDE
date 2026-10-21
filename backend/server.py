"""Vercel ASGI entry point. Never imports data or applies migrations at startup."""
from .app import create_app

app = create_app()
