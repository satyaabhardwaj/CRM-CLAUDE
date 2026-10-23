"""One password rule everywhere (owner decision, 22 Oct 2026): 12 to 1024 characters."""
import pytest
from backend import passwords
from backend.provision_user import provision
from backend.tests.test_api import api


@pytest.mark.parametrize('value', ['', 'a' * 11, 'a' * 1025, None])
def test_rule_refuses(value):
    with pytest.raises(ValueError, match='at least 12'):
        passwords.check(value)


@pytest.mark.parametrize('value', ['a' * 12, 'x' * 1024])
def test_rule_accepts(value):
    assert passwords.check(value) == value


def test_provisioning_uses_the_rule(api):
    _, engine, _ = api
    with pytest.raises(ValueError, match='at least 12'):
        provision(engine, 'short@qa.invalid', 'a' * 11, 'reader')
    assert provision(engine, 'twelve@qa.invalid', 'a' * 12, 'reader')


def test_change_and_reset_endpoints_use_the_rule():
    from backend.mfa import NewPassword
    from backend.recovery import Reset
    for model, field in ((NewPassword, 'new_password'), (Reset, 'password')):
        meta = {type(m).__name__: m for m in model.model_fields[field].metadata}
        assert meta['MinLen'].min_length == 12 and meta['MaxLen'].max_length == 1024
