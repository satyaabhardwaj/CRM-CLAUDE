# WhatsApp in Sales

Everything for WhatsApp in Sales is in this one file: `chat.js` (the look is inside it too).

- A **WhatsApp button** in every client's header, next to "Download PDF". It opens the chat with that client.
- A **WhatsApp icon** after the "Collected" tile. It opens the WhatsApp screen: every chat, with the client it belongs to.
- Sent messages and client replies are saved on the client's contact list.

## To switch it off (nothing else to undo)

Open `sales/index.html` and delete this one line:

    <script src="/sales/whatsapp/chat.js"></script>

The button, the icon and the screen all go. Put the line back to switch it on again.
The copy of the files from before this was added is in `backup/before-whatsapp/`.

It talks to TimelinesAI through the laptop server (`/whatsapp/timelines.py`). The token is in `/whatsapp/keys.env`.
The online copy has no backend, so none of this shows there.

## TimelinesAI switch

TimelinesAI was switched off and back on again on 13 Oct 2026. To switch it off, two steps:
1. In `chat.js`, change `const TIMELINES = true;` to `false`.
2. Rename `/whatsapp/keys.env` to `keys.env.off`.
Only the "WhatsApp Web" button stays when it is off.
