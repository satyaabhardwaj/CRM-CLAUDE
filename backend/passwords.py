"""The one password rule (owner decision, 22 Oct 2026): 12 to 1024 characters, everywhere a password is set
(provisioning, reset link, change on Account security, Users page, local first-run admin)."""
MIN_LENGTH = 12
MAX_LENGTH = 1024
RULE = f'Use a password of at least {MIN_LENGTH} characters (at most {MAX_LENGTH}).'


def check(password):
    """Raise ValueError with the rule when the password does not meet it."""
    if not isinstance(password, str) or not MIN_LENGTH <= len(password) <= MAX_LENGTH:
        raise ValueError(RULE)
    return password
