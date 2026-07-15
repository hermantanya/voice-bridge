# Voice Bridge

Real-time voice translation between two devices. Hold a button, speak in your language, and your partner hears the translation in theirs.

**v1.0** — English ↔ Hebrew, turn-based, phone + browser.

## What it does

- Two people join the same room with a short code
- Each person sets **My language** (English or Hebrew)
- **First come, first serve:** whoever holds **Hold to talk** first speaks
- Speech is transcribed, translated, and played to the other person
- Transcripts appear on screen with latency timing

## How to use it

### 1. Set languages (before joining)

On each device: **Language settings** → pick the language **you** speak.

Example: Hebrew speaker sets Hebrew, English speaker sets English.

> Language is sent when you join a room. If you change it later, leave and rejoin.

### 2. Start a session

| Device | Action |
|---|---|
| **Phone** | Create a new room (note the code) |
| **Browser or second phone** | Enter the code → Join room |

Both should show **2 participants**.

### 3. Talk

1. When both see **Ready — hold to talk**, either person can press first
2. Hold the button, speak, then release
3. Wait a few seconds for translation
4. The other person hears the translated audio automatically
5. Floor opens again — next person to press speaks

### Testing with phone + Mac browser

```bash
# Terminal 1 — phone (Expo Go)
cd apps/mobile
npx expo start

# Terminal 2 — browser
cd apps/mobile
npx expo start --web
```

Open `http://localhost:8081` in Chrome. Allow microphone when prompted.

## Architecture

```
Phone/Browser                    Railway Server                    OpenAI
     │                                │                              │
     │  WebSocket (Socket.io)         │                              │
     ├───────────────────────────────►│  Whisper STT                 │
     │  audio_chunk / claim_turn      ├─────────────────────────────►│
     │                                │  GPT-4o-mini translate       │
     │◄───────────────────────────────┤  TTS                         │
     │  translation_result + audio    │                              │
```

## Project structure

```
voice-bridge/
├── server/           # Node.js + Socket.io backend
├── apps/mobile/      # Expo app (iOS, Android, web)
├── package.json      # Railway deploy entry
└── railway.toml      # Railway build config
```

## Server setup

### Prerequisites

- Node.js 20+
- OpenAI API key with credits

### Local development

```bash
cd server
npm install
cp .env.example .env   # add OPENAI_API_KEY
npm run dev
curl http://localhost:3001/health
```

### Deploy to Railway

1. Push this repo to GitHub
2. Railway → **Deploy from GitHub** → select the repo
3. Root directory: **repository root** (uses `railway.toml`)
4. Variables:
   - `OPENAI_API_KEY` — your key (no trailing spaces)
   - `CLIENT_ORIGIN` — `*` for dev, restrict in production
5. Verify: `https://<your-app>.up.railway.app/health`

### Point the app at your server

Edit `apps/mobile/src/config.ts`:

```ts
export const SERVER_URL = "https://your-app.up.railway.app";
```

## WebSocket events

| Event | Direction | Purpose |
|---|---|---|
| `join_room` | client → server | Join with room code and language |
| `claim_turn` | client → server | Claim speaking turn (first press wins) |
| `audio_chunk` | client → server | Send recorded audio |
| `turn_state` | server → clients | Whose turn / processing state |
| `translation_result` | server → listener | Translated audio + transcript |
| `translation_sent` | server → speaker | Confirmation + transcript |

## API

`POST /api/translate?sourceLang=en&targetLang=he&format=wav` — send raw audio, get JSON with `sourceText`, `translatedText`, `audioBase64`, `latencyMs`.

`GET /health` — server status.

## Security

- API keys live only in `server/.env` (local) or Railway Variables (production)
- Never commit `.env` files
- Before pushing: `git grep -iE "sk-|api_key" -- ':!*.example'`

### Going public on GitHub

The mobile app points at your Railway URL. If the repo is public, anyone could use that endpoint and spend your OpenAI credits.

**Built-in rate limits** (per IP / per connection):

| Variable | Default | Protects |
|---|---|---|
| `RATE_LIMIT_TRANSLATE_PER_HOUR` | 30 | REST `/api/translate` |
| `RATE_LIMIT_AUDIO_PER_HOUR` | 120 | WebSocket translations |
| `RATE_LIMIT_JOIN_PER_MINUTE` | 20 | Room join attempts |

Set these in Railway Variables. For personal use, defaults are plenty. Tighten if needed.

**Optional later:** user auth, per-room tokens, or requiring everyone to self-host their own Railway backend.

## Known limitations (v1.0)

- Two participants per room only
- English and Hebrew only
- Turn-based (one speaker at a time)
- ~3–6 second latency per message
- Web push-to-talk requires Chrome; mic active only while holding button
- Language setting applies on room join — rejoin after changes

## Roadmap

| Version | Features |
|---|---|
| **v1.0** ✅ | EN ↔ HE, turn-based, phone + web |
| v1.1 | Russian |
| v1.2 | Voice matching |
| v1.3 | 10+ languages, auto-detect |
| v1.4 | App Store / PWA distribution |

## License

Private during development.
