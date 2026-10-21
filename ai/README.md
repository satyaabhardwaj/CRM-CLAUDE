# AI for the Magppie CRM

Everything that uses an AI model lives in this folder and nowhere else. The screens never talk to an AI
service directly. They ask the FastAPI backend (`backend/integrations.py`), and the backend asks the code here.

| Folder | What it holds |
|---|---|
| `agents/` | One file per agent. An agent does one job when asked, for example writing down a voice note. |
| `automations/` | One file per automation. An automation runs by itself on a trigger, for example every morning. Empty for now. |
| `keys.env` | The keys for the AI services. This file stays on this laptop. It is never shown on a screen, never put in the online copy and never typed into a chat. Copy `keys.env.example` to make it. |

## Agents

| Agent | Job | Model | Cost |
|---|---|---|---|
| `agents/transcriber.py` | Turns a recorded voice note into text. Understands Hindi, English and the two mixed. | Whisper large v3 on Groq, or Whisper on OpenAI | Groq has a free tier. OpenAI is paid per minute. |

## Rules
- No key in the code, in the saved data or in a chat.
- An agent that has no key says so plainly. It never pretends to have worked.
- Nothing here writes to Zoho.
- A new agent or automation is added only after Manish says yes to it.
