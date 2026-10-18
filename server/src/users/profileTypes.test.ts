import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidEmail,
  normalizeEmail,
  validateProfilePatch,
} from "./profileTypes.js";

test("normalizeEmail lowercases and trims", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("isValidEmail rejects obvious invalid addresses", () => {
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail("not-an-email"), false);
  assert.equal(isValidEmail("a@b.co"), true);
});

test("validateProfilePatch accepts hearLang and speakerGender", () => {
  const result = validateProfilePatch({
    hearLang: "he",
    speakerGender: "male",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.patch, { hearLang: "he", speakerGender: "male" });
  }
});

test("validateProfilePatch accepts elevenlabsVoiceId", () => {
  const result = validateProfilePatch({ elevenlabsVoiceId: "voice-123" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.patch.elevenlabsVoiceId, "voice-123");
  }
});

test("validateProfilePatch clears empty elevenlabsVoiceId to null", () => {
  const result = validateProfilePatch({ elevenlabsVoiceId: "  " });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.patch.elevenlabsVoiceId, null);
  }
});
