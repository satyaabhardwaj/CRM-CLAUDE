# Magppie WhatsApp helper (Windows)

With this installed, on that PC:
- The WhatsApp mirror shows in the CRM by itself. No "choose a window to share" question.
- **Send** in the CRM sends the message straight away (about half a second). You stay in the CRM.
- **Photo or video** sends a picture, video or PDF (up to 100 MB) to the client's chat.
- No "Open WhatsApp?" questions.

## Install once per Windows PC
1. The WhatsApp app for Windows must be installed and logged in. Keep it open (it can sit behind other windows, but not minimised).
2. Double-click **install.cmd**. No admin rights needed. It starts now and every time Windows starts.
3. Close and reopen Chrome or Edge once.

## Undo
Double-click **uninstall.cmd**. Everything is removed.

## If something does not work
Open `%LOCALAPPDATA%\MagppieWA\log.txt` (paste it into the File Explorer address bar) and send what it says.

## Safety
It listens only on this PC (127.0.0.1), answers only the Magppie CRM pages, and sends only when Send is clicked in the CRM,
one message at a time.
