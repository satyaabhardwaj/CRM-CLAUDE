FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS frontend
WORKDIR /app
COPY sales sales
COPY design design
COPY accounts accounts
COPY measurement measurement
COPY management management
COPY backend backend
COPY shared shared
RUN set -eu; for module in backend sales design accounts measurement management; do cd /app/$module/react; npm ci; npm run build; done

FROM python:3.12-slim-bookworm@sha256:34386ef0cb081344d7ec1c103ba398e6e9f64e9ab3a1509accc92a4e24a07258 AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 CRM_UPLOADS_DIR=/var/lib/crm/uploads PORT=8000
WORKDIR /app
COPY requirements-backend.txt .
RUN pip install --no-cache-dir -r requirements-backend.txt && useradd --uid 10001 --create-home crm && mkdir -p /var/lib/crm/uploads && chown -R crm:crm /var/lib/crm
COPY backend backend
# Only the shared runtime helpers; retired HTTP server is excluded.
COPY core/__init__.py core/security.py core/storage.py core/
COPY shared shared
COPY sales sales
COPY design design
COPY accounts accounts
COPY measurement measurement
COPY management management
COPY ai ai
COPY mail mail
COPY sign sign
COPY alembic.ini .
COPY --from=frontend /app/sales/assets sales/assets
COPY --from=frontend /app/design/assets design/assets
COPY --from=frontend /app/accounts/assets accounts/assets
COPY --from=frontend /app/measurement/assets measurement/assets
COPY --from=frontend /app/management/assets management/assets
COPY --from=frontend /app/backend/web/assets backend/web/assets
USER crm
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 CMD ["python", "-m", "backend.healthcheck"]
CMD ["uvicorn", "backend.app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
