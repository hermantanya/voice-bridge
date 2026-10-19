# Voice Bridge — Execution Plan

Living plan for v1.x delivery. Updated when we change provider or scope.

**Last updated:** October 2026 (**v1.4 shipped**; v1.5 internal polish done; **standalone app v2** — self-mute on PTT + iOS WAV upload fixes shipped; **PTT latency** — early `translation_transcript` before TTS + Settings **Transcript only**; server `utterance` routing kept for future integrations; **client hands-free VAD removed from standalone app** — PTT-only product; **Streaming PTT** milestone documented below; **external beta** optional when domain ready). **Any Streaming PTT change must keep batch PTT regression tests green** (`latency.integration`, `verify-regressions`, `transcriptState` client tests). **TTS playback regression:** only the **listener** plays incoming translation audio (`translation_result` / partner partials); the **speaker** must never hear `translation_sent` or their own turn TTS (`verify-regressions`: `speaker must not play own translation TTS`).

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
| **v1.4** — Signed-in profiles; voice sync; welcome/guest entry | ✅ Shipped |
| **v1.5** — Internal polish ✅; **external beta** (domain + Resend + EAS) when ready | 📋 Next |

**Deployed:** Railway (`voice-bridge-production-c537.up.railway.app`)

### v1.4 phase 1 — Auth choice (October 2026)

**Approach:** Email **OTP** (6-digit code, 10-minute TTL) + **HS256 JWT** sessions. No third-party auth SDK on mobile; `Authorization: Bearer` for profile APIs. Optional **Resend** for OTP email in production; dev/non-production may return `devCode` in JSON when `AUTH_DEV_RETURN_OTP=true` or `NODE_ENV !== production`.

**Why this (minimal for Expo Go + Railway):** Avoids App Store OAuth setup, keeps JWT sessions stateless on the server, and persists accounts in **Supabase Postgres** via `DATABASE_URL` (local dev without a DB falls back to JSON under `USER_DATA_DIR`). Matches “sign in on a second phone” without blocking phase 2 voice sync.

**Storage:** Supabase Postgres (`DATABASE_URL` on Railway). Schema: `users` table (`id`, `email`, `hear_lang`, `speaker_gender`, `elevenlabs_voice_id`, timestamps); applied on server startup from `server/src/db/schema.sql`. Verify connectivity with `cd server && npm run db:ping`.

**Profile schema (server):** `hearLang`, `speakerGender`, `elevenlabsVoiceId` (nullable, **read-only in phase 1** — PATCH rejects voice_id until phase 2).

**Phase 1 — shipped (October 2026):**

- [x] `POST /api/auth/request-otp`, `POST /api/auth/verify-otp`
- [x] `GET /api/profile`, `PATCH /api/profile` (hearLang, speakerGender)
- [x] Mobile Settings → Account (sign-in / sign-out); signed-in users sync Translate-to + gender
- [x] Guests unchanged: optional device-local prefs in AsyncStorage
- [x] Supabase Postgres on Railway (`DATABASE_URL`); TLS + non-fatal migration logging for deploy stability
- [x] Mobile: **expo-audio** (Expo SDK 57 / Expo Go); sign-in error handling (no uncaught OTP failures)
- [x] Interim prod testing: `AUTH_DEV_RETURN_OTP` on Railway (keep until **external beta** — see below)

---

## v1.4 phase 2 — Voice sync across devices (shipped)

**Goal:** After sign-in, **`elevenlabsVoiceId`** lives on the server profile and follows the user to every device (enroll once, join from phone or web with the same cloned voice).

**Server:**

- [x] Allow `elevenlabsVoiceId` in `PATCH /api/profile` (`validateProfilePatch` + Postgres `UPDATE`)
- [x] On enroll / remove (signed-in): mobile PATCH profile; remove still deletes ElevenLabs clone via existing API
- [x] `GET /api/profile` returns `elevenlabsVoiceId` — source of truth when signed in

**Mobile / web:**

- [x] On sign-in: server voice → local; if server empty but local enrolled → push local to server
- [x] After enrollment / remove on signed-in user: sync to server via PATCH
- [x] Guests: device-local `useVoiceProfile` unchanged
- [x] Settings copy: signed-in vs guest voice storage

**Deploy + verify:**

- [x] E2E: enroll on web, sign in on phone → same voice in session without re-enrolling
- [x] Bump to **v1.4.0** and update README / health version when phase 2 ships

---

## v1.5 internal polish (shipped — household / dev OTP only)

No domain or Resend required. Production keeps **`AUTH_DEV_RETURN_OTP=true`** so sign-in codes appear in the app (fine for you and anyone beside you while testing).

- [x] **CI green:** fix flaky `join-room.integration.test.ts` so GitHub `check` is trustworthy on every push
- [x] **Dogfood pass:** two devices + web with **signed-in** accounts — Translate to, gender, and **cloned voice** all consistent across devices
- [x] **Railway / Supabase checklist:** `DATABASE_URL`, `AUTH_JWT_SECRET`, rate limits, health smoke test documented for operators (see README **Production operator checklist**)

**Do not do yet:** real inbox OTP, turning off dev codes, or inviting strangers — that waits for **External beta readiness** below.

---

## External beta readiness (**when inviting people outside the household**)

Gate: you are ready to give testers a link and they sign in **without** seeing a dev code on screen.

### No domain yet? (remember this)

- **Resend Free ($0)** works for beta volume, but **you need a domain you control** to send to arbitrary inboxes (`AUTH_FROM_EMAIL` like `Voice Bridge <auth@yourdomain.com>` + DNS in Resend).
- **`onboarding@resend.dev`** is sandbox only — not a substitute for real beta (typically limited to your own Resend account email).
- **No domain today** → stay on **dev OTP**; defer everything in this section until you buy a domain (~$10–15/year) or otherwise control DNS. The app and Railway deploy are unchanged.

### Checklist (in order, when ready)

- [ ] **Domain:** register one (Cloudflare / Porkbun / Namecheap, etc.); add Resend SPF/DKIM records (no website required)
- [ ] **Resend (free tier):** `RESEND_API_KEY` + `AUTH_FROM_EMAIL` on Railway; smoke-test OTP to a real inbox
- [ ] **Lock down dev OTP:** set `AUTH_DEV_RETURN_OTP=false` (and `NODE_ENV=production` on Railway)
- [ ] **Expo Go + EAS** share link for a small tester group (no App Store / $99 yet)
- [ ] **Short tester doc:** sign-in, enroll once, join room from two phones
- [ ] **Later:** App Store / PWA packaging if we outgrow Expo Go

---

## v2.0 — Standalone app: PTT + self-mute (**shipped for 2-person**)

**Product decision (October 2026):** The **standalone Voice Bridge app** stays **push-to-talk only**. Hands-free VAD in the client is **out of scope** — removed after phase 3 spike; Settings **Hands-free** stays visible as **coming soon** (no live VAD). We **double down** on PTT reliability (iOS PCM WAV uploads, self-mute, turn handling).

**Self-mute (PTT):** When **muted**, hold-to-talk is disabled, no uplink, clear **Live / Muted** banner + accessibility. Unmute restores hold-to-talk.

**Server (kept, dormant for standalone):** `utterance` routing and `conversationMode: "hands_free"` on `join_room` remain on the server for **future call/meeting integrations**; standalone clients always join as **push_to_talk** and only send `audio_chunk`.

| Item | Standalone app | Server |
|---|---|---|
| Push-to-talk + turn lock | ✅ Shipped | ✅ |
| Session self-mute | ✅ Shipped | — |
| iOS WAV / upload fixes | ✅ Shipped | ✅ validation |
| Client VAD → `utterance` | ❌ Removed / deferred | ✅ Ready when integrated |
| Settings hands-free toggle (live) | ❌ Cancelled | — |

### Shipped phases (standalone)

1. [x] **Self-mute + indicator** on PTT session
2. [x] **iOS recording reliability** (PCM WAV path, truncated upload guards)
3. [x] **Server utterance routing** (Option A) + integration tests — unused by standalone client
4. [x] **PTT latency** — server emits `translation_transcript` / `translation_sent_transcript` right after STT+translate; `translation_result` follows with audio; optional dev `PIPELINE_TIMING_LOGS=1`; Settings **Play translated voice** vs **Transcript only** (`playTranslatedVoice: false` on `join_room` skips server TTS)

### Cancelled / deferred (standalone app)

- [~] **Client VAD** (was v2 phase 3) — **reverted**; not shipping in standalone app
- [~] **Live hands-free Settings mode** (was v2 phase 4) — **deferred**; UI shows coming soon only

---

## Streaming PTT milestone (planned)

**Problem:** Today the client sends one **`audio_chunk`** after button release. The server runs batch Whisper STT, then translate + TTS. Long utterances feel slow — the partner sees nothing until the full recording is uploaded and processed.

**Goal:** Keep the **hold-to-talk UI unchanged** (same turn lock, self-mute, floor rules). While the button is held, **stream audio** to the server; run **streaming ASR** and emit **partial transcripts**; translate partials and push **`partial_translation`** (or similarly named) WebSocket events so the listener sees text build in real time. On **release**, **finalize** the utterance (commit final transcript + translation) and run **TTS once** on the final text (optional if Settings **Transcript only** / `playTranslatedVoice: false`).

**Not the same as removed hands-free VAD:** Streaming PTT is still **explicit push-to-talk** — audio uplink only while the user holds the button. No ambient listening, no client VAD auto-segmentation, no `utterance` events from a always-on mic. **Deferred standalone hands-free** (Settings “coming soon”) **stays deferred.**

### Approach (high level)

| Layer | Change |
|---|---|
| Client | During hold: send small time-sliced chunks (e.g. MediaRecorder `timeslice` on web; platform equivalent on iOS) instead of waiting for release |
| Server | Maintain per-turn streaming session; forward audio to streaming STT provider; debounce partial translate; emit partial WS events to listener (and optionally speaker) |
| Release | End stream; take final STT result; existing pipeline for `translation_transcript` + `translation_result` / TTS |
| Fallback | If streaming unavailable or provider errors, **keep current batch PTT** (single chunk on release) |

### Phases

1. **Spike (web):** `MediaRecorder` chunked upload + one streaming STT provider — evaluate **Deepgram**, **AssemblyAI**, or **OpenAI** realtime/streaming APIs (latency, HE/RU quality, cost). Wire **`partial_translation`** (and partial transcript if split) on Socket.io; measure time-to-first-partial vs batch.
2. **Productize web:** Feature flag or auto-detect; rate limits for partial events; integration tests for hold → partials → release → TTS.
3. **iOS / Expo:** Chunked capture compatible with existing PCM/WAV path where possible; same server contract.
4. **Polish:** Cap partial update rate; clear partial UI on turn end; document operator cost.

### Dependencies

- **Provider API key** for chosen streaming STT (may differ from batch Whisper-only path today).
- **Cost:** Streaming ASR is often billed per audio minute **while holding**; partial translation adds extra GPT calls unless batched/throttled — budget for dogfood before wide beta.

### Status

🚧 **Phase 1 spike (web) — shipped behind flags** — OpenAI Realtime `intent=transcription` relay on server; web PCM uplink + partial UI; batch PTT default unchanged.

- [x] **Server:** `STREAMING_PTT_ENABLED=1` + client `streamingPtt` on `join_room`; events `streaming_ptt_start` / `streaming_audio_chunk` / `streaming_ptt_stop`; emits `partial_transcript` + `partial_translation`; finalize + batch fallback via `audio_chunk` pipeline
- [x] **Web client:** `EXPO_PUBLIC_STREAMING_PTT=1` or Settings **Streaming PTT (dev)**; PCM16 chunks during hold; partner **Partner (live)** banner on SessionScreen
- [ ] **Phase 2+:** rate limits for partials, iOS chunked uplink, operator cost docs

---

## Future: call integration add-on (Zoom / WhatsApp / video calls)

**Not parallel to the standalone HF app.** Hands-free utterance routing is intended for a **separate integration** that taps **system/call audio** (Zoom, WhatsApp, FaceTime, etc.) — not the in-app mic VAD path we rolled back.

**Rough roadmap (when prioritized):**

- [ ] Capture/transcript hook for **call audio** (platform-specific — share extension, virtual audio device, or partner SDK)
- [ ] Bridge utterances into existing server **`utterance`** pipeline (per-speaker, overlap OK)
- [ ] Playback routing back into the call or earbuds (product TBD)
- [ ] Optional companion UI (mute matrix, “translate this call” toggle)

Standalone app remains the **dogfood PTT interpreter**; call add-on is a **follow-on SKU / integration**, documented separately when scoped.

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
| **v1.4** | ✅ Shipped — profiles + voice sync + guest/welcome. **v1.5:** internal dogfood + CI. **External beta:** domain + Resend + EAS when ready |
| **v2.0** | ✅ Standalone **PTT + self-mute** + iOS upload fixes (shipped). Hands-free VAD **removed** from standalone app |
| **v2.x** | **Streaming PTT** — partial STT/translate while holding button; batch PTT fallback — see section above |
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
- Voice profile is **per device** for guests; signed-in users sync via server profile
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
