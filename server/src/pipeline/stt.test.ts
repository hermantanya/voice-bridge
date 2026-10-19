import assert from "node:assert/strict";
import test from "node:test";

import {
  detectAudioFormatFromBuffer,
  MIN_AUDIO_BYTES,
  resolveWhisperUploadFormat,
} from "./audioFormat.js";

test("resolveWhisperUploadFormat keeps CAF bytes for Whisper upload", () => {
  const cafHeader = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  cafHeader.write("caff", 0, "ascii");
  assert.equal(resolveWhisperUploadFormat(cafHeader, "m4a"), "caf");
  assert.equal(detectAudioFormatFromBuffer(cafHeader), "caf");
});

test("resolveWhisperUploadFormat keeps m4a when client reports caf URI", () => {
  const m4aHeader = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  m4aHeader.write("ftyp", 4, "ascii");
  assert.equal(resolveWhisperUploadFormat(m4aHeader, "caf"), "m4a");
});
