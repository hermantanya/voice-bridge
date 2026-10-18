# Voice Bridge — Execution Plan

Living plan for v1.x delivery. Updated when we change provider or scope.

**Last updated:** October 2026 (v1.4 phase 1 in progress — auth + server profile; v1.3 shipped)

---

## Provider decision (August 2026)

| Provider | Spike | Private clone | HE + RU | Production choice |
|---|---|---|---|---|
| OpenAI Custom Voices | ❌ 404 (no org access) | — | — | Rejected |
| Fish Audio API | ✅ `npm run spike:voice:fish` | ✅ `visibility: private` | ✅ (83 langs) | Spiked; not chosen |
| **ElevenLabs IVC** | ✅ `npm run spike:voice:elevenlabs` | ✅ private | ✅ (v3 + `language_code`) | **✅ Shipped in v1.2** |

**Decision:** ElevenLabs IVC for cloned-voice TTS. OpenAI remains on Whisper STT + GPT-4o-mini translation only.

## Current state

| Milestone | Status |
|---|---|
| **v1.0** — EN ↔ HE, 2-person push-to-talk | ✅ Shipped |
| **v1.1** — + RU, transcripts, speaking-time stats, web mic picker | ✅ Shipped |
| **v1.2** — Real voice on translated speech (ElevenLabs IVC) | ✅ Shipped |
| **v1.3** — Auto-detect spoken language; Translate-to UX; voice preview | ✅ Shipped |
| **v1.4** — App Store / PWA; signed-in profiles; voice sync | 📋 Next (phase 1: auth + profile in progress) |

**Deployed:** Railway (`voice-bridge-production-c537.up.railway.app`)

### v1.4 phase 1 — Auth choice (October 2026)

**Approach:** Email **OTP** (6-digit code, 10-minute TTL) + **HS256 JWT** sessions. No third-party auth SDK on mobile; `Authorization: Bearer` for profile APIs. Optional **Resend** for OTP email in production; dev/non-production may return `devCode` in JSON when `AUTH_DEV_RETURN_OTP=true` or `NODE_ENV !== production`.

**Why this (minimal for Expo Go + Railway):** Avoids App Store OAuth setup, keeps JWT sessions stateless on the server, and persists accounts in **Supabase Postgres** via `DATABASE_URL` (local dev without a DB falls back to JSON under `USER_DATA_DIR`). Matches “sign in on a second phone” without blocking phase 2 voice sync.

**Storage:** Supabase Postgres (`DATABASE_URL` on Railway). Schema: `users` table (`id`, `email`, `hear_lang`, `speaker_gender`, `elevenlabs_voice_id`, timestamps); applied on server startup from `server/src/db/schema.sql`. Verify connectivity with `cd server && npm run db:ping`.

**Profile schema (server):** `hearLang`, `speakerGender`, `elevenlabsVoiceId` (nullable, **read-only in phase 1** — PATCH rejects voice_id until phase 2).

**Phase 1 done in repo:**

- [x] `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`
- [x] `GET /api/profile`, `PATCH /api/profile` (hearLang, speakerGender)
- [x] Mobile Settings → Account (sign-in / sign-out); signed-in users sync Translate-to + gender
- [x] Guests unchanged: optional device-local prefs in AsyncStorage; voice enrollment still device-local

**Deferred to v1.4 phase 2:** Server-stored `elevenlabsVoiceId`, cross-device voice enrollment, App Store / PWA distribution work.

---

## v1.2 pivot (July 2026)

We planned **OpenAI Custom Voices** for Track 1 (real voice). Spike result:

| Test | Result |
|---|---|
| Preset OpenAI TTS (`nova`) | ✅ Works (still used as fallback) |
| OpenAI Custom Voices API | ❌ 404 — org lacks access (enterprise/eligibility) |

**Decision:** Keep OpenAI for **STT + translation** only. Replace **TTS** with **ElevenLabs IVC**.

**Rejected alternatives:**

| Provider | Why not (for now) |
|---|---|
| xAI Custom Voices | No official Hebrew in TTS list; US geo restriction; programmatic create = Enterprise |
| Fish Audio | Spiked; ElevenLabs chosen for quality + ecosystem on Starter tier |
| OpenAI Custom Voices | Blocked on account access (404) |

---

## v1.2 architecture (shipped)

```
Phone/Browser                 Railway Server                    Providers
     │                              │                              │
     │  WebSocket                   │                              │
     ├─────────────────────────────►│  Whisper STT ───────────────►│ OpenAI
     │  join_room (+ voice_id)      │  GPT-4o-mini translate ────►│ OpenAI
     │  audio_chunk                 │  ElevenLabs TTS (speaker's   │
     │◄─────────────────────────────┤   cloned voice_id) ─────────►│ ElevenLabs
     │  translation_result + audio  │  (fallback: OpenAI nova)     │
```

**Enrollment (once per device):**

```
Settings → Set up my voice → record script (30s min, ~45–60s target)
        → POST /api/voices/enroll
        → ElevenLabs IVC API → voice_id
        → save voice_id locally (AsyncStorage)
        → every join_room sends voice_id
```

**Runtime rule:** When user A speaks, the **listener** hears translation synthesized with **A's** `voice_id` (not a preset persona). Unenrolled users fall back to OpenAI `nova`.

---

## v1.2 execution phases

### Phase 0 — OpenAI spike (done)

- [x] Add `server/scripts/spike-custom-voice.ts`
- [x] Confirm preset TTS works
- [x] Confirm Custom Voices API unavailable → pivot decision

### Phase 1 — TTS provider spike (done)

- [x] Fish Audio spike — `npm run spike:voice:fish`
- [x] ElevenLabs spike — `npm run spike:voice:elevenlabs`
- [x] **Chosen provider: ElevenLabs IVC**

### Phase 2 — Server (done)

- [x] `server/src/voices/elevenlabs.ts` — IVC clone, TTS, delete
- [x] `server/src/pipeline/tts.ts` — ElevenLabs with `voice_id` + target language; `nova` fallback
- [x] `runTranslationPipeline()` accepts optional `voiceId`
- [x] Handler uses speaker's `socket.data.elevenlabsVoiceId`
- [x] `POST /api/voices/enroll` + `DELETE /api/voices/:voiceId`
- [x] `join_room` payload: optional `elevenlabsVoiceId`
- [x] Gender-aware translation prompts (`genderInstruction.ts`)
- [x] `ELEVENLABS_API_KEY` in `.env.example`
- [x] Rate-limit enroll endpoint (`RATE_LIMIT_ENROLL_PER_HOUR`)

### Phase 3 — Mobile (done)

- [x] Settings → **Set up my voice** + `VoiceSetupScreen`
- [x] Gender-aware enrollment scripts (HE female/male)
- [x] 30s minimum duration; stop anytime; preview after create
- [x] Persist `elevenlabsVoiceId` in AsyncStorage
- [x] Pass `voice_id` on every `join_room`
- [x] Home badge: language · gender · voice status
- [x] Web enrollment respects saved Mac microphone (not Continuity phone)

### Phase 4 — Deploy + docs (done)

- [x] Push to GitHub, deploy Railway with `ELEVENLABS_API_KEY`
- [x] E2E: two devices, EN ↔ HE ↔ RU with cloned voices
- [x] Update README architecture, roadmap, env vars
- [x] Mark v1.2 done in this file

---

## Enrollment UX decisions

| Topic | Decision |
|---|---|
| Sample length | **30 seconds minimum**; scripts target ~45–60s read time |
| Sample language | User's own language (HE / RU / EN) — gender-aware Hebrew scripts |
| Frequency | **Once** — `voice_id` persists on ElevenLabs until deleted |
| Cross-device | **Not in v1.2** — device-local storage only; signed-in profiles in **v1.4** |
| Raw audio retention | Optional locally; **`voice_id` is the durable asset** |

---

## Environment variables (v1.2)

| Variable | Where | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Server | Whisper + GPT translate |
| `ELEVENLABS_API_KEY` | Server | IVC enroll + TTS |
| `FISH_API_KEY` | Server | Optional — Fish spike only (not production) |
| `RATE_LIMIT_ENROLL_PER_HOUR` | Server | Protect voice slots (default 10) |
| `EXPO_PUBLIC_SERVER_URL` | Mobile | Backend URL |

---

## ElevenLabs constraints (plan for scale)

| Limit | Starter | Impact |
|---|---|---|
| Custom voice slots | 10 | Fine for dev + small tester group; not many production users on one key |
| Voice operations / month | 65 | Each new clone counts; re-enroll sparingly |
| IVC | ✅ Starter+ | What we use |
| PVC | ❌ Creator+ | Out of scope for v1.2 |

**Later (v1.4+):** Higher tier, per-user billing, or architecture review when user count grows.

---

## Roadmap after v1.3

| Version | Focus |
|---|---|
| **v1.4** | App Store / PWA; **signed-in user profiles**; sync `voice_id` across devices; migrate off device-only storage |
| **v2.0** | Hands-free (VAD); pass-through languages; saved language prefs |
| **v2.1+** | Group rooms, mute matrix, dinner-table mode — see [VISION.md](VISION.md) |

---

## v1.3 architecture (shipped)

```
Phone/Browser                 Railway Server                    Providers
     │                              │                              │
     │  WebSocket                   │                              │
     ├─────────────────────────────►│  Whisper STT (auto-detect) ─►│ OpenAI
     │  join_room (hearLang)        │  GPT-4o-mini translate ─────►│ OpenAI
     │  audio_chunk                 │  ElevenLabs TTS (speaker's   │
     │◄─────────────────────────────┤   cloned voice_id) ─────────►│ ElevenLabs
     │  translation_result + audio  │  (fallback: OpenAI nova)     │
     │                              │  same-lang → transcript only │
```

**Language routing:**

- User sets **Translate to** (`hearLang`) — the language they want to hear
- Server auto-detects spoken language on each turn (Whisper `verbose_json`)
- If detected language = listener's Translate-to → skip translation + TTS (`skippedTts: true`)
- Otherwise translate + TTS (cloned voice when speaker enrolled)

**Voice preview (Settings):**

```
Settings → Play voice preview
        → POST /api/voices/preview { voiceId, language, gender }
        → ElevenLabs TTS with stored voice_id
        → play sample on device
```

---

## Known v1.3 limitations (ship with eyes open)

- Two participants only (unchanged)
- Real voice requires enrollment; unenrolled users fall back to preset voice
- Voice profile is **per device** until v1.4
- ~3–6s latency may increase slightly with ElevenLabs TTS
- All clones live under **our** ElevenLabs account (Starter slot cap)
- Same-language turns are transcript-only (no audio to listener)

---

## v1.3 execution phases

### Phase 1 — Server (done)

- [x] `languageDetection.ts` — normalize Whisper codes/names (`hebrew` → `he`)
- [x] `stt.ts` — auto-detect via Whisper `verbose_json`; optional override
- [x] Pipeline skips translation + TTS when source = target
- [x] `join_room` uses `hearLang` for listener routing
- [x] `POST /api/voices/preview` for Settings replay
- [x] Release turn floor on translation errors (no stuck "partner speaking")

### Phase 2 — Mobile (done)

- [x] Settings: **Translate to** (was "My language")
- [x] Session: voice status, last-heard mode (cloned / preset / same language)
- [x] Settings: **Play voice preview** for enrolled voices
- [x] Wait for voice profile load before socket join
- [x] Re-emit `join_room` when voice id or language changes
- [x] Voice setup: script language picker (defaults to Translate-to)

### Phase 3 — Deploy + docs (done)

- [x] Push to GitHub, deploy Railway
- [x] E2E: EN / HE / RU auto-detect across web + mobile
- [x] Update README, VISION, EXECUTION_PLAN; bump to v1.3.0

---

## Files shipped (v1.3)

```
server/
  src/pipeline/languageDetection.ts
  src/pipeline/languageDetection.test.ts
  src/pipeline/stt.ts
  src/pipeline/index.ts
  src/routes/voices.ts          (+ POST /preview)
  src/ws/handler.ts
  src/voices/enrollment.ts

apps/mobile/
  src/screens/SettingsScreen.tsx
  src/screens/SessionScreen.tsx
  src/screens/VoiceSetupScreen.tsx
  src/session/appState.ts
  src/session/voicePreviewPlayback.ts
  src/api/enrollVoice.ts
  src/hooks/useSocket.ts
  App.tsx
```

---

## Files shipped (v1.2)

```
server/
  scripts/spike-custom-voice-fish.ts
  scripts/spike-custom-voice-elevenlabs.ts
  src/voices/elevenlabs.ts
  src/voices/enrollment.ts
  src/voices/fishAudio.ts              (spike helper, not production)
  src/pipeline/tts.ts
  src/pipeline/genderInstruction.ts
  src/ws/handler.ts
  src/routes/voices.ts
  .env.example

apps/mobile/
  src/screens/SettingsScreen.tsx
  src/screens/VoiceSetupScreen.tsx
  src/hooks/useVoiceProfile.ts
  src/hooks/useEnrollmentRecording.ts
  src/hooks/useSocket.ts
  src/api/enrollVoice.ts
  src/web/microphoneDevices.ts         (acquireWebMicrophoneStream)
  src/session/enrollmentPrompts.ts
```

---

## Reference

- Product roadmap (user-facing): [README.md](README.md#roadmap)
- Long-term vision: [VISION.md](VISION.md)
- OpenAI spike (historical): `npm run spike:voice` in `server/`
- Fish spike: `npm run spike:voice:fish` in `server/`
- ElevenLabs spike: `npm run spike:voice:elevenlabs` in `server/`
