# Emails the CRM sends by itself

The screens never send email. They ask the engine (`core/server.py`), and the engine asks `send.py`.

| When | Who gets it |
|---|---|
| A client's 30% is in after the final drawing signoff, so the order moves to the Factory | The factory address in `keys.env` |

Copy `keys.env.example` to `keys.env` and fill it in to switch it on. The file stays on this laptop.
While `MAIL_TEST_EMAIL` is filled in, every email goes there and nowhere else.
With no keys, nothing is sent and the screen says so.
