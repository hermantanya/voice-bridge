import assert from "node:assert/strict";
import test from "node:test";

import {
  detectAudioFormatFromBuffer,
  MIN_AUDIO_BYTES,
  resolveWhisperUploadFormat,
} from "./audioFormat.js";

function buildM4aWithMdat(payloadBytes: number): Buffer {
  const ftyp = Buffer.alloc(32);
  ftyp.writeUInt32BE(32, 0);
  ftyp.write("ftyp", 4, "ascii");
  ftyp.write("mp42", 8, "ascii");

  const mdat = Buffer.alloc(8 + payloadBytes);
  mdat.writeUInt32BE(8 + payloadBytes, 0);
  mdat.write("mdat", 4, "ascii");
  mdat.fill(0xab, 8);

  return Buffer.concat([ftyp, mdat]);
}

test("resolveWhisperUploadFormat detects CAF bytes for diagnostics", () => {
  const cafHeader = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  cafHeader.write("caff", 0, "ascii");
  assert.equal(resolveWhisperUploadFormat(cafHeader, "m4a"), "caf");
  assert.equal(detectAudioFormatFromBuffer(cafHeader), "caf");
});

test("resolveWhisperUploadFormat keeps m4a when client reports caf URI", () => {
  const m4aHeader = buildM4aWithMdat(1200);
  assert.equal(resolveWhisperUploadFormat(m4aHeader, "caf"), "m4a");
});
