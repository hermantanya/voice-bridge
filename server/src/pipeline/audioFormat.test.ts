import assert from "node:assert/strict";
import test from "node:test";

import {
  MIN_AUDIO_BYTES,
  mimeTypeForAudioFormat,
  normalizeAudioFormat,
  validateAudioBuffer,
} from "./audioFormat.js";

test("normalizeAudioFormat maps caf to m4a for Whisper", () => {
  assert.equal(normalizeAudioFormat("caf"), "m4a");
  assert.equal(normalizeAudioFormat(".CAF"), "m4a");
});

test("normalizeAudioFormat keeps known Whisper formats", () => {
  assert.equal(normalizeAudioFormat("webm"), "webm");
  assert.equal(normalizeAudioFormat("m4a"), "m4a");
  assert.equal(normalizeAudioFormat("3gp"), "3gp");
});

test("mimeTypeForAudioFormat covers mobile uploads", () => {
  assert.equal(mimeTypeForAudioFormat("m4a"), "audio/mp4");
  assert.equal(mimeTypeForAudioFormat("3gp"), "audio/3gpp");
});

test("validateAudioBuffer rejects tiny payloads", () => {
  assert.equal(
    validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES - 1)),
    "Recording too short. Hold the button a little longer and try again.",
  );
  assert.equal(validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES)), null);
});
