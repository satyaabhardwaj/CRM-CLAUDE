"""Admin-only Users page API (owner decision, 22 Oct 2026). Needs an administrator with an enabled
authenticator, except on a development laptop where MFA cannot be set up (the existing admin MFA rule)."""
from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from . import users as staff
from .permissions import ROLES


class NewUser(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: str = Field(min_length=3, max_length=320)
    role: str = Field(min_length=1, max_length=20)


class Role(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: str = Field(min_length=1, max_length=20)


def register(app, engine, settings, who, mfa):
    realm = settings.auth_realm if settings.environment != 'development' else ''

    def administrator(db, request):
        user = who(db, request)
        if user['role'] != 'admin':
            raise HTTPException(403, 'Only administrators can manage users.')
        factor = mfa.factor(db, user['id'])
        unavailable = settings.environment == 'development' and (not mfa.schema or mfa.cipher is None)
        if not (factor and factor['enabled']) and not unavailable:
            raise HTTPException(403, {'error': 'Set up your authenticator app to manage users.', 'mfa_enrollment_required': True})
        return user

    def run(request, action):
        with engine.begin() as db:
            actor = administrator(db, request)
            try:
                return action(db, actor['id'])
            except staff.Refused as error:
                raise HTTPException(409, str(error)) from None

    @app.get('/api/admin/users')
    def list_users(request: Request):
        with engine.connect() as db:
            administrator(db, request)
            return {'users': staff.listing(db), 'roles': list(ROLES)}

    @app.post('/api/admin/users')
    def add_user(body: NewUser, request: Request):
        uid, password = run(request, lambda db, actor: staff.add(db, actor, body.email, body.role, realm))
        return {'id': uid, 'temporary_password': password}

    @app.post('/api/admin/users/{user_id}/role')
    def set_role(user_id: str, body: Role, request: Request):
        run(request, lambda db, actor: staff.change_role(db, actor, user_id, body.role))
        return {'ok': True}

    @app.post('/api/admin/users/{user_id}/deactivate')
    def deactivate(user_id: str, request: Request):
        run(request, lambda db, actor: staff.deactivate(db, actor, user_id))
        return {'ok': True}

    @app.post('/api/admin/users/{user_id}/reactivate')
    def reactivate(user_id: str, request: Request):
        run(request, lambda db, actor: staff.reactivate(db, actor, user_id))
        return {'ok': True}

    @app.post('/api/admin/users/{user_id}/reset-password')
    def reset_password(user_id: str, request: Request):
        return {'temporary_password': run(request, lambda db, actor: staff.reset_password(db, actor, user_id))}
