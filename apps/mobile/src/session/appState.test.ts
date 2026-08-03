import assert from "node:assert/strict";
import test from "node:test";

import {
  buildJoinRoomPayload,
  canJoinRoom,
  formatProfileBadge,
  generateRoomCode,
  normalizeRoomCode,
  shouldApplyTurnState,
  shouldClearPartnerLang,
} from "./appState.js";

test("formatProfileBadge shows language and gender", () => {
  assert.equal(formatProfileBadge("he", "female"), "Hebrew · Female");
  assert.equal(formatProfileBadge("en", "male"), "English · Male");
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

test("buildJoinRoomPayload sends language and gender on join", () => {
  assert.deepEqual(
    buildJoinRoomPayload({
      roomCode: "ABCD",
      myLang: "ru",
      speakerGender: "male",
    }),
    {
      roomCode: "ABCD",
      speakLang: "ru",
      hearLang: "ru",
      speakerGender: "male",
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
