# Signatures (Zoho Sign)

Sends a document from the CRM to Zoho Sign, so the client signs it on their phone or laptop.
The screens never talk to Zoho. They ask the FastAPI backend (`backend/integrations.py`), and the backend asks `zoho_sign.py`.

## What it does
1. Sales presses **Send for signature** on the OCF.
2. The OCF PDF goes to Zoho Sign with the client's name and email. Zoho emails the client a signing link.
3. If `SIGN_MAGPPIE_EMAIL` is set, that person signs after the client.
4. **Check status** asks Zoho where it stands. When it is complete, the signed PDF is saved on the client.

## Switching it on
Copy `keys.env.example` to `keys.env` in this folder and fill it in. The file stays on this laptop.
It is never shown on a screen, never put in the online copy and never typed into a chat.

## Safety
- While `SIGN_TEST_EMAIL` is filled in, every document goes to that address and never to the client. Clear it to go live.
- With no keys, the button says so plainly. Nothing is sent.
- This sends real emails once it is live. It does not touch Zoho CRM.
