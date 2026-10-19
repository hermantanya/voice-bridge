import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJoinRoomPayload,
  canJoinRoom,
  formatProfileBadge,
  generateRoomCode,
  hasCustomVoice,
  normalizeRoomCode,
  resolveVoiceProfileStatus,
  shouldApplyTurnState,
  shouldClearPartnerLang,
  voiceProfileLabel,
} from "./appState.js";

test("formatProfileBadge shows language, gender, and voice status", () => {
  assert.equal(formatProfileBadge("he", "female"), "Hebrew · Female · Preset voice");
  assert.equal(formatProfileBadge("en", "male"), "English · Male · Preset voice");
  assert.equal(
    formatProfileBadge("ru", "female", "custom"),
    "Russian · Female · My voice",
  );
});

test("voice profile helpers resolve custom voice state", () => {
  assert.equal(voiceProfileLabel("default"), "Preset voice");
  assert.equal(voiceProfileLabel("custom"), "My voice");
  assert.equal(hasCustomVoice(null), false);
  assert.equal(hasCustomVoice(" voice123 "), true);
  assert.equal(resolveVoiceProfileStatus("abc"), "custom");
  assert.equal(resolveVoiceProfileStatus(""), "default");
});

test("normalizeRoomCode trims and uppercases", () => {
  assert.equal(normalizeRoomCode("  abcd  "), "ABCD");
});

test("canJoinRoom requires at least four characters", () => {
  assert.equal(canJoinRoom("abc"), false);
  assert.equal(canJoinRoom("abcd"), true);
});

test("generateRoomCode returns six uppercase characters", () => {
  const code = generateRoomCode(() => 0.123456789);
  assert.match(code, /^[A-Z0-9]{6}$/);
});

test("buildJoinRoomPayload sends translate-to, gender, and optional voice id", () => {
  assert.deepEqual(
    buildJoinRoomPayload({
      roomCode: "ABCD",
      myLang: "ru",
      speakerGender: "male",
    }),
    {
      roomCode: "ABCD",
      hearLang: "ru",
      speakerGender: "male",
    },
  );

  assert.deepEqual(
    buildJoinRoomPayload({
      roomCode: "ABCD",
      myLang: "en",
      speakerGender: "female",
      speakLangOverride: "he",
      elevenlabsVoiceId: " voice-123 ",
    }),
    {
      roomCode: "ABCD",
      hearLang: "en",
      speakLangOverride: "he",
      speakerGender: "female",
      elevenlabsVoiceId: "voice-123",
    },
  );

  assert.deepEqual(
    buildJoinRoomPayload({
      roomCode: "ABCD",
      myLang: "en",
      speakerGender: "female",
      playTranslatedVoice: false,
    }),
    {
      roomCode: "ABCD",
      hearLang: "en",
      speakerGender: "female",
      playTranslatedVoice: false,
    },
  );
});

test("shouldApplyTurnState ignores stale turn updates", () => {
  const current = {
    turnParticipantId: "a",
    phase: "speaking" as const,
    version: 3,
  };

  assert.equal(
    shouldApplyTurnState(current, {
      turnParticipantId: null,
      phase: "waiting",
      version: 2,
    }),
    false,
  );

  assert.equal(
    shouldApplyTurnState(current, {
      turnParticipantId: null,
      phase: "waiting",
      version: 3,
    }),
    true,
  );
});

test("shouldClearPartnerLang when alone in room", () => {
  assert.equal(shouldClearPartnerLang(1), true);
  assert.equal(shouldClearPartnerLang(2), false);
});
