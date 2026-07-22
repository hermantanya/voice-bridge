# Voice Bridge — Execution Plan

Living plan for v1.x delivery. Updated when we change provider or scope.

**Last updated:** July 2026 (v1.2 pivot to ElevenLabs)

---

## Current state

| Milestone | Status |
|---|---|
| **v1.0** — EN ↔ HE, 2-person push-to-talk | ✅ Shipped |
| **v1.1** — + RU, transcripts, speaking-time stats, web mic picker | ✅ Shipped |
| **v1.2** — Real voice on translated speech | 🔄 In progress |

**Deployed:** Railway (`voice-bridge-production-c537.up.railway.app`)

---

## v1.2 pivot (July 2026)

We planned **OpenAI Custom Voices** for Track 1 (real voice). Spike result:

| Test | Result |
|---|---|
| Preset OpenAI TTS (`nova`) | ✅ Works |
| OpenAI Custom Voices API | ❌ 404 — org lacks access (enterprise/eligibility) |

**Decision:** Keep OpenAI for **STT + translation** only. Replace **TTS** with **ElevenLabs Instant Voice Cloning (IVC)**.

**Rejected alternatives:**

| Provider | Why not |
|---|---|
| xAI Custom Voices | No official Hebrew in TTS list; US geo restriction; programmatic create = Enterprise |
| Cartesia | Evaluated; ElevenLabs chosen for IVC + Hebrew v3 path |
| OpenAI Custom Voices | Blocked on account access |

---

## v1.2 target architecture

```
Phone/Browser                 Railway Server                    Providers
     │                              │                              │
     │  WebSocket                   │                              │
     ├─────────────────────────────►│  Whisper STT ───────────────►│ OpenAI
     │  join_room (+ voice_id)      │  GPT-4o-mini translate ────►│ OpenAI
     │  audio_chunk                 │  ElevenLabs TTS (speaker's   │
     │◄─────────────────────────────┤   cloned voice_id) ─────────►│ ElevenLabs
     │  translation_result + audio  │                              │
```

**Enrollment (once per device, v1.2):**

```
Settings → record ~30–45s sample (user's language)
        → POST /api/voices/enroll
        → ElevenLabs IVC API → voice_id
        → save voice_id locally (AsyncStorage)
        → every join_room sends voice_id
```

**Runtime rule:** When user A speaks, the **listener** hears translation synthesized with **A's** `voice_id` (not a preset persona).

---

## v1.2 execution phases

### Phase 0 — OpenAI spike (done)

- [x] Add `server/scripts/spike-custom-voice.ts`
- [x] Confirm preset TTS works
- [x] Confirm Custom Voices API unavailable → pivot decision

### Phase 1 — ElevenLabs spike (gate)

**Goal:** Validate quality and latency before building UI.

- [ ] Sign up ElevenLabs **Starter** (~$5/mo)
- [ ] Add `ELEVENLABS_API_KEY` to `server/.env` and Railway
- [ ] Add `server/scripts/spike-elevenlabs-voice.ts` (or extend spike script):
  - Clone ~30–45s sample via IVC API → `voice_id`
  - TTS test phrases in **Hebrew**, **Russian**, **English**
  - Hebrew: use **Eleven v3** + `language_code: "he"`
- [ ] Document spike results (pass/fail, latency, quality notes)

**Do not proceed to Phase 2 if spike fails.**

### Phase 2 — Server

- [ ] Add ElevenLabs client + `server/src/voices/elevenlabs.ts`
- [ ] Replace `server/src/pipeline/tts.ts` — ElevenLabs TTS with `voice_id` + target language
- [ ] Extend `runTranslationPipeline()` to accept optional `voiceId`
- [ ] Wire handler: on translate, use **speaker's** `socket.data.elevenlabsVoiceId`
- [ ] New `POST /api/voices/enroll` — accept audio, call IVC, return `{ voiceId }`
- [ ] Extend `join_room` payload: optional `elevenlabsVoiceId`
- [ ] Fallback: preset/default voice if participant has not enrolled
- [ ] Update `server/.env.example` with `ELEVENLABS_API_KEY`
- [ ] Rate-limit enroll endpoint (protect voice slots + ops quota)
- [ ] Deprecate or archive OpenAI voice helpers (`openaiVoices.ts`) — keep spike script for reference

### Phase 3 — Mobile

- [ ] Settings → **Set up my voice** flow
  - 3–4 short prompts in user's language (~30–45s total)
  - Record → upload → preview TTS
  - Re-enroll option
  - Disclosure: AI-generated speech in user's voice likeness
- [ ] Persist `elevenlabsVoiceId` in **AsyncStorage** (device-local, v1.2 scope)
- [ ] Pass stored `voice_id` on every `join_room`
- [ ] Show enrollment status on home/settings (e.g. "Voice ready" / "Set up voice")

### Phase 4 — Deploy + docs

- [ ] Push to GitHub, deploy Railway with `ELEVENLABS_API_KEY`
- [ ] E2E: two devices, both enrolled, EN ↔ HE ↔ RU with real voices
- [ ] Update README architecture, roadmap, env vars
- [ ] Mark v1.2 done in this file

---

## Enrollment UX decisions

| Topic | Decision |
|---|---|
| Sample length | **~30–45 seconds** (ElevenLabs has no hard minimum; 30s can work; 1–2 min is ideal quality, not required) |
| Sample language | User's own language (HE / RU / EN) — no fixed English consent script |
| Frequency | **Once** — `voice_id` persists on ElevenLabs until deleted |
| Cross-device | **Not in v1.2** — device-local storage only; signed-in profiles in **v1.4** |
| Raw audio retention | Optional locally; **`voice_id` is the durable asset** |

---

## Environment variables (v1.2)

| Variable | Where | Purpose |
|---|---|---|
| `OPENAI_API_KEY` | Server | Whisper + GPT translate (unchanged) |
| `ELEVENLABS_API_KEY` | Server | IVC enroll + TTS |
| `EXPO_PUBLIC_SERVER_URL` | Mobile | Backend URL (unchanged) |

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

## Roadmap after v1.2

| Version | Focus |
|---|---|
| **v1.3** | Auto-detect spoken language; user sets hearing language only |
| **v1.4** | App Store / PWA; **signed-in user profiles**; sync `voice_id` across devices; migrate off device-only storage |
| **v2.0** | Hands-free (VAD); pass-through languages; saved language prefs |
| **v2.1+** | Group rooms, mute matrix, dinner-table mode — see [VISION.md](VISION.md) |

---

## Known v1.2 limitations (ship with eyes open)

- Two participants only (unchanged)
- Real voice requires enrollment; unenrolled users fall back to preset voice
- Voice profile is **per device** until v1.4
- ~3–6s latency may increase slightly with ElevenLabs TTS
- All clones live under **our** ElevenLabs account (Starter slot cap)

---

## Files touched (expected)

```
server/
  scripts/spike-elevenlabs-voice.ts   (new)
  src/voices/elevenlabs.ts            (new)
  src/pipeline/tts.ts                 (replace OpenAI TTS)
  src/pipeline/index.ts               (voiceId param)
  src/ws/handler.ts                   (join_room + speaker voice_id)
  src/routes/voices.ts                (new enroll endpoint)
  .env.example

apps/mobile/
  src/screens/SettingsScreen.tsx      (enrollment UI)
  src/screens/VoiceSetupScreen.tsx    (optional new screen)
  src/hooks/useVoiceProfile.ts        (new — AsyncStorage)
  src/hooks/useSocket.ts              (pass voice_id on join)
```

---

## Reference

- Product roadmap (user-facing): [README.md](README.md#roadmap)
- Long-term vision: [VISION.md](VISION.md)
- OpenAI spike (historical): `npm run spike:voice` in `server/`
