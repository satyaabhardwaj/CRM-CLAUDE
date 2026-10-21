"""Read-only account details; synthetic fixture only."""
import pytest
from sqlalchemy import insert, select
from backend.models import credentials, users, sessions
from backend.tests.test_api import api, sign_in


@pytest.mark.parametrize('uid,role', [('a','admin'), ('r','reader'), ('s','assigned')])
def test_me_reads_only_current_email_without_changing_account_or_session(api, uid, role):
    client, engine, _ = api
    with engine.begin() as db:
        for user in ('a','r','s'):
            db.execute(insert(credentials).values(user_id=user,email=user+'@qa.invalid',password_hash='synthetic-not-used'))
    assert client.get('/api/auth/me').status_code == 401
    sign_in(client,uid)
    def rows():
        with engine.connect() as db:
            return [list(db.execute(select(table)).mappings()) for table in (users,credentials,sessions)]
    before=rows()
    assert client.get('/api/auth/me').json()=={'id':uid,'role':role,'active':1,'email':uid+'@qa.invalid'}
    assert rows()==before


def test_me_missing_email_does_not_change_authentication(api):
    client, _, _ = api
    sign_in(client)
    assert client.get('/api/auth/me').json()=={'id':'a','role':'admin','active':1,'email':None}
