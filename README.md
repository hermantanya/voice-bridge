# Voice Bridge

Real-time voice translation between two devices. Hold a button, speak in your language, and your partner hears the translation in theirs.

**v1.1:** English, Hebrew, and Russian. Push-to-talk, first-come-first-serve turns, phone + browser, live transcripts, and per-person speaking time.

## What it does

- Two people join the same room with a short code
- Each person sets **My language** (English, Hebrew, or Russian)
- **First come, first serve:** whoever holds **Hold to talk** first speaks
- Speech is transcribed, translated, and played to the other person
- Transcripts appear in a scrollable two-column history (You / Others)
- Session stats track connection time and each person's speaking time (hold + translation)
- On web, choose which microphone to use (e.g. Mac built-in vs. phone relay)

## How to use it

### 1. Set languages (before joining)

On each device: tap the language badge on the home screen (or **Language settings**) and pick the language **you** speak.

Example: Hebrew speaker sets Hebrew, English speaker sets English, Russian speaker sets Russian.

> Language is sent when you join a room. If you change it later, leave and rejoin.

**Web only:** open **Language settings** to pick your microphone if the browser chose the wrong device (common on Mac when an iPhone is nearby).

### 2. Start a session

| Device | Action |
|---|---|
| **Phone** | Create a new room (note the code) |
| **Browser or second phone** | Enter the code → Join room |

Both should show **2 participants**.

### 3. Talk

1. When both see **Ready: hold to talk**, either person can press first
2. Hold the button, speak, then release
3. Wait a few seconds for translation
4. The other person hears the translated audio automatically
5. Floor opens again; next person to press speaks

### Testing with phone + Mac browser

```bash
# Terminal 1: phone (Expo Go)
cd apps/mobile
cp .env.example .env   # first time only; set your server URL in .env
npx expo start

# Terminal 2: browser
cd apps/mobile
npx expo start --web
```

Open `http://localhost:8081` in Chrome. Allow microphone when prompted. If the wrong mic is selected, open **Language settings** from the home screen and choose your Mac's built-in microphone.

### 4. Session screen

Once two participants are connected, the session shows:

| Stat | Meaning |
|---|---|
| **Session duration** | Wall-clock time since you both connected |
| **Your speaking time** | Your hold-to-talk + translation time (updates when your turn finishes) |
| **Partner speaking time** | Their hold + translation time (updates when their turn finishes) |

While you hold the button or translation is running, the button animates and speaking times stay frozen until that turn completes.

## Architecture

**v1.1 (current):** OpenAI for STT, translate, and preset TTS (`nova`).

**v1.2 (in progress):** OpenAI for STT + translate; **ElevenLabs** for cloned-voice TTS. See [EXECUTION_PLAN.md](EXECUTION_PLAN.md).

```
Phone/Browser                    Railway Server                 OpenAI + ElevenLabs
     │                                │                              │
     │  WebSocket (Socket.io)         │                              │
     ├───────────────────────────────►│  Whisper STT ───────────────►│ OpenAI
     │  join_room (+ voice_id)        │  GPT-4o-mini translate ─────►│ OpenAI
     │  audio_chunk / claim_turn      │  ElevenLabs TTS (speaker's   │
     │◄───────────────────────────────┤   cloned voice_id) ─────────►│ ElevenLabs
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
- OpenAI API key with credits (Whisper + GPT translate)
- ElevenLabs API key on **Starter** tier or above (v1.2 voice cloning + TTS)

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
   - `OPENAI_API_KEY`: your key (no trailing spaces)
   - `ELEVENLABS_API_KEY`: your key (v1.2+; Starter tier for voice cloning)
   - `CLIENT_ORIGIN`: `*` for dev, restrict in production
5. Verify: `https://<your-app>.up.railway.app/health`

### Point the app at your server

```bash
cd apps/mobile
cp .env.example .env
```

Edit `.env` (never commit this file):

```bash
EXPO_PUBLIC_SERVER_URL=https://your-app.up.railway.app
```

Restart Expo after changing (`npx expo start --clear`).

### v1.2 real voice (Track 1)

**Provider:** ElevenLabs Instant Voice Cloning (IVC). OpenAI stays on Whisper + GPT translate only.

OpenAI Custom Voices was spiked and blocked (404 — org lacks API access). Full step-by-step plan: **[EXECUTION_PLAN.md](EXECUTION_PLAN.md)**.

**Next gate — ElevenLabs spike** (before enrollment UI):

```bash
cd server
cp .env.example .env   # OPENAI_API_KEY + ELEVENLABS_API_KEY
# npm run spike:elevenlabs   # coming in Phase 1
```

Enrollment target: **~30–45 seconds** of natural speech in the user's language (HE/RU/EN), once per device; `voice_id` reused every session.

Historical OpenAI spike (reference only):

```bash
npm run spike:voice
```

## WebSocket events

| Event | Direction | Purpose |
|---|---|---|
| `join_room` | client → server | Join with room code, language, optional `elevenlabsVoiceId` (v1.2) |
| `claim_turn` | client → server | Claim speaking turn (first press wins) |
| `audio_chunk` | client → server | Send recorded audio |
| `turn_state` | server → clients | Whose turn / processing state |
| `translation_result` | server → listener | Translated audio + transcript |
| `translation_sent` | server → speaker | Confirmation + transcript |
| `usage_update` | server → clients | Session timing sync (speaking times update on turn complete) |
| `error` | server → client | Error message |

**Usage metrics:** Session duration is wall-clock from when two participants join. The app shows **your speaking time** and **partner speaking time** (each person's hold + translation). The server also tracks a merged room total for billing (overlapping speech is not double-counted); that internal metric is not shown in the session UI.

`audio_chunk` may include `recordingStartedAt` (epoch ms) so the server can anchor each interval at hold-to-talk start.

## API

`POST /api/translate?sourceLang=en&targetLang=he&format=wav`: send raw audio, get JSON with `sourceText`, `translatedText`, `audioBase64`, `latencyMs`.

`GET /health`: server status.

## Security

- API keys live only in `server/.env` (local) or Railway Variables (production)
- Never commit `.env` files
- Before pushing: `git grep -iE "sk-|api_key" -- ':!*.example'`

### Going public on GitHub

Treat your **server URL** like an API key: keep it in `apps/mobile/.env` (gitignored), not in source code. The repo ships `.env.example` with a placeholder.

The mobile app connects to your Railway deployment. If someone learns that URL, they could use your server and spend OpenAI and ElevenLabs credits. Rate limits (below) reduce that risk.

**Built-in rate limits** (per IP / per connection):

| Variable | Default | Protects |
|---|---|---|
| `RATE_LIMIT_TRANSLATE_PER_HOUR` | 30 | REST `/api/translate` |
| `RATE_LIMIT_AUDIO_PER_HOUR` | 120 | WebSocket translations |
| `RATE_LIMIT_JOIN_PER_MINUTE` | 20 | Room join attempts |

Set these in Railway Variables. For personal use, defaults are plenty. Tighten if needed.

**Optional later:** user auth, per-room tokens, or requiring everyone to self-host their own Railway backend.

## Known limitations (v1.1)

- Two participants per room only
- English, Hebrew, and Russian only (any pair: EN ↔ HE ↔ RU)
- One speaker at a time; floor is open until someone presses (not pre-assigned)
- ~3–6 second latency per message
- Web push-to-talk requires Chrome; mic active only while holding button
- Language setting applies on room join; rejoin after changes
- Speaking time counts update after each turn completes, not live during hold

## Roadmap

Near-term engineering steps for v1.2: **[EXECUTION_PLAN.md](EXECUTION_PLAN.md)**.

### Shipped and next (v1.x)

| Version | Features |
|---|---|
| **v1.0** (done) | EN ↔ HE, 2 participants, push-to-talk, first-come-first-serve turns, phone + web |
| **v1.1** (done) | + Russian (EN ↔ HE ↔ RU); scrollable transcript; session + speaking time stats; web mic picker; merged room usage on server (for future billing) |
| v1.2 | Real voice on translated speech (enroll once ~30–45s; partner hears **your** cloned voice via ElevenLabs IVC). **In progress:** ElevenLabs spike → server TTS swap → Settings enrollment + device-local `voice_id`. Plan: [EXECUTION_PLAN.md](EXECUTION_PLAN.md) |
| v1.3 | Auto-detect spoken language; user sets preferred hearing language only |
| v1.4 | App Store / PWA; signed-in user profiles; sync voice across devices |

### Group and table (v2–v3)

| Version | Features |
|---|---|
| v2.0 | Optional hands-free (VAD); pass-through languages (transcribe, no TTS); saved language prefs |
| v2.1 | 3–6 participants; device = persona (no shared-mic diarization yet) |
| v2.5 | Per-persona mute/unmute; per-speaker transcripts |
| v3.0 | Dinner table mode: multi-lingual room, mute matrix, mixed pass-through |
| v3.1 | Minute-based pricing + usage dashboard (uses server-side merged speaking intervals) |

### Product arc

v1 is a two-person walkie-talkie interpreter. v2 adds group rooms, filters, and hands-free options. v3 targets a dinner-table interpretation layer where each person hears what they need and can mute what they don't.

```mermaid
flowchart LR
  v1[v1_TwoPerson] --> v2[v2_GroupRoom]
  v2 --> v3[v3_DinnerTable]
  v3 --> vision[VISION_v4plus]
```

For mission statement and long-term direction (wearables, multimodal intent, v4+): see [VISION.md](VISION.md).

## License

Personal project in real-time voice translation. All rights reserved.
