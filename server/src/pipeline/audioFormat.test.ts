import assert from "node:assert/strict";
import test from "node:test";

import {
  detectAudioFormatFromBuffer,
  MIN_AUDIO_BYTES,
  mimeTypeForAudioFormat,
  normalizeAudioFormat,
  resolveWhisperUploadFormat,
  validateAudioBuffer,
  validateRecordingDurationMs,
} from "./audioFormat.js";

test("normalizeAudioFormat keeps caf for Whisper x-caf uploads", () => {
  assert.equal(normalizeAudioFormat("caf"), "caf");
  assert.equal(normalizeAudioFormat(".CAF"), "caf");
});

test("normalizeAudioFormat keeps known Whisper formats", () => {
  assert.equal(normalizeAudioFormat("webm"), "webm");
  assert.equal(normalizeAudioFormat("m4a"), "m4a");
  assert.equal(normalizeAudioFormat("3gp"), "3gp");
});

test("mimeTypeForAudioFormat covers mobile uploads", () => {
  assert.equal(mimeTypeForAudioFormat("m4a"), "audio/mp4");
  assert.equal(mimeTypeForAudioFormat("3gp"), "audio/3gpp");
  assert.equal(mimeTypeForAudioFormat("caf"), "audio/x-caf");
});

test("detectAudioFormatFromBuffer identifies common containers", () => {
  const cafHeader = Buffer.alloc(512, 0);
  cafHeader.write("caff", 0, "ascii");
  assert.equal(detectAudioFormatFromBuffer(cafHeader), "caf");

  const mp4Header = Buffer.alloc(512, 0);
  mp4Header.write("ftyp", 4, "ascii");
  assert.equal(detectAudioFormatFromBuffer(mp4Header), "m4a");
});

test("resolveWhisperUploadFormat prefers CAF bytes over m4a client hint", () => {
  const cafHeader = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  cafHeader.write("caff", 0, "ascii");
  assert.equal(resolveWhisperUploadFormat(cafHeader, "m4a"), "caf");
});

test("validateAudioBuffer rejects tiny payloads", () => {
  assert.equal(
    validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES - 1)),
    "Recording too short. Hold the button a little longer and try again.",
  );
  const m4aPayload = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  m4aPayload.write("ftyp", 4, "ascii");
  assert.equal(validateAudioBuffer(m4aPayload), null);
  assert.match(
    validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES, 1)) ?? "",
    /too short/i,
  );
});

test("validateRecordingDurationMs rejects very short holds", () => {
  assert.match(
    validateRecordingDurationMs(50) ?? "",
    /too short/i,
  );
  assert.equal(validateRecordingDurationMs(250), null);
});
