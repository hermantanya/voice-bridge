# Voice Bridge: Vision

**Mission:** Making conversations in multilingual environments feel natural and seamless, regardless of language, cultural background, or neurodiversity of the participants.

Long-term product direction beyond v3. This document captures north-star scenarios and research-grade ideas. Near-term milestones live in [README.md](README.md).

## North star scenario: the dinner table

Four people sit at a table. Each speaks a different language or mix of languages. Each wears or carries a device running Voice Bridge.

- Person 1 speaks to Person 3 in Hebrew
- Person 2 and 4 are talking nearby in English and Russian
- Person 1 wants to hear 1 and 3, but **mute 2 and 4** for now, and unmute them later

Everyone hears the conversation they care about, in their preferred language, with each speaker as a distinct **persona** (voice, name, optional avatar). The app is an interpretation layer on top of a shared social space, not a single shared phone passed around.

## Speaker attribution: how we know who spoke

We phase this in rather than solving it all at once.

| Phase | Approach | When |
|---|---|---|
| v2 | **One device per person** (the phone in your pocket is your persona) | Reliable, shippable |
| v3+ | Optional **shared-mic diarization** (one mic tries to separate speakers) | Hard in noisy rooms; best for meetings, not dinner tables |
| v4+ | **Proximity via wearables** (glasses, earbuds, UWB) | Best signal for "who is near me" |

**Recommendation:** ship device-as-persona first. Do not bet the dinner-table MVP on volume levels or a single room microphone.

Volume-based selection fails when glasses clink, music plays, or two people talk at once. Proximity from wearables is promising but years out as a primary signal.

## Pass-through languages

Users fluent in more than one language should not hear robotic TTS for speech they already understand.

Example: you speak English and Hebrew. When someone speaks English:

- **Transcribe** and show on screen
- **Do not** read aloud via TTS

When someone speaks Russian:

- **Translate and read aloud** in your preferred language

This requires per-user language profiles (saved in v1.4+, expanded in v2.0).

## Pricing model (v3.1+)

**Minutes translated**, not tokens.

| Why minutes | Why not tokens |
|---|---|
| Users understand "minutes of conversation" | Token counts are invisible to normal people |
| Maps to Whisper + TTS costs | Matches OpenAI billing, not human mental models |

Suggested tiers:

- **Full pipeline** (transcribe + translate + speak): priced per minute
- **Transcribe only** (pass-through languages): lower per-minute rate
- Bundles (e.g. 100 minutes/month) for regular users

The server already tracks per-person speaking time and a merged room total (union of active intervals, so overlapping speech in group mode is not double-counted). v3.1 exposes this in a billing dashboard.

Exact pricing depends on real usage data from v3 beta.

## Multimodal intent (v5+)

Research-grade horizon. Not a near-term engineering milestone.

Go beyond speech translation into **social and cultural understanding**:

- Speech + tone + gaze + gesture + context
- Infer intent, not just words
- Help neurodivergent users (e.g. autism spectrum) parse social cues
- Help neurotypical users in unfamiliar cultures (US vs Middle East norms differ sharply)

This parallels multimodal AI research (speech + behavior + environment) but is a **separate product line**, likely health-adjacent, with regulatory and ethical considerations.

**Wearables** (Meta glasses, smart earbuds) become the natural form factor: always-on, proximity-aware, hands-free, camera + mic for multimodal input.

## Summary

| Horizon | Product |
|---|---|
| v1 | Walkie-talkie interpreter (2 people; EN, HE, RU in v1.1) |
| v2 | Group channel with filters and mute |
| v3 | Dinner-table interpretation layer |
| v4+ | Shared-mic diarization, proximity experiments |
| v5+ | Wearables + multimodal social cognition |
