# Voice Bridge

Real-time voice translation for mobile — speak in one language, hear another in your headphones.

**v1.0 scope:** Turn-based bidirectional English ↔ Hebrew between two phones.

## Project structure

```
voice-bridge/
├── server/          # Node.js backend (API proxy + WebSocket)
└── apps/mobile/     # Expo React Native app (Step 3+)
```

## Prerequisites

- Node.js 20+
- OpenAI API key with credits
- Railway account (free tier) for hosting
- Expo Go on your phone (for mobile testing)

## Local development

### 1. Install server dependencies

```bash
cd server
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY (never commit this file)
```

### 3. Start the server

```bash
npm run dev
```

### 4. Verify health check

```bash
curl http://localhost:3001/health
```

### 5. Test translation pipeline (requires OPENAI_API_KEY in .env)

Record a short English phrase, then:

```bash
# macOS: record 3 seconds from mic
rec -r 16000 -c 1 -b 16 test.wav trim 0 3

curl -X POST "http://localhost:3001/api/translate?sourceLang=en&targetLang=he&format=wav" \
  --data-binary @test.wav \
  -o response.json

# Play translated audio (macOS)
node -e "const r=require('./response.json');require('fs').writeFileSync('out.mp3',Buffer.from(r.audioBase64,'base64'))"
afplay out.mp3
```

Expected `response.json` fields: `sourceText`, `translatedText`, `audioBase64`, `latencyMs`.

## Deploy to Railway

1. Push this repo to GitHub.
2. In [Railway](https://railway.app), create a new project → **Deploy from GitHub repo** → select `voice-bridge`.
3. Set the **root directory** to `server` (Settings → Root Directory).
4. Add environment variables in Railway → Variables:
   - `OPENAI_API_KEY` = your key
   - `CLIENT_ORIGIN` = `*` (tighten in production)
5. Deploy and open the public URL + `/health`.

## Security

- API keys live only in `server/.env` (local) or Railway Variables (production).
- Never commit `.env` files.
- Before pushing: `git grep -iE "sk-|api_key" -- ':!*.example'`

## Roadmap

- [x] Step 1: Backend skeleton + WebSocket
- [x] Step 2: STT → translate → TTS pipeline
- [ ] Step 3: Mobile app shell
- [ ] Step 4: Audio capture + playback
- [ ] Step 5: Turn-based bidirectional
- [ ] Step 6: Polish + v1.0 release

## License

Private during development. Will go public at v1.0 milestone.
