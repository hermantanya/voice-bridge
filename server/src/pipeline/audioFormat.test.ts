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

function buildWavWithPcm(pcmBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmBytes, 40);
  const pcm = Buffer.alloc(pcmBytes, 0xcd);
  return Buffer.concat([header, pcm]);
}

test("normalizeAudioFormat keeps known Whisper formats", () => {
  assert.equal(normalizeAudioFormat("webm"), "webm");
  assert.equal(normalizeAudioFormat("m4a"), "m4a");
  assert.equal(normalizeAudioFormat("wav"), "wav");
  assert.equal(normalizeAudioFormat("3gp"), "3gp");
  assert.equal(normalizeAudioFormat("caf"), "webm");
});

test("mimeTypeForAudioFormat covers mobile uploads", () => {
  assert.equal(mimeTypeForAudioFormat("m4a"), "audio/mp4");
  assert.equal(mimeTypeForAudioFormat("wav"), "audio/wav");
  assert.equal(mimeTypeForAudioFormat("3gp"), "audio/3gpp");
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

test("validateAudioBuffer rejects tiny, caf, and header-only m4a", () => {
  assert.equal(
    validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES - 1)),
    "Recording too short. Hold the button a little longer and try again.",
  );

  const headerOnlyM4a = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  headerOnlyM4a.write("ftyp", 4, "ascii");
  assert.match(validateAudioBuffer(headerOnlyM4a) ?? "", /could not read/i);

  const cafPayload = Buffer.alloc(MIN_AUDIO_BYTES, 0);
  cafPayload.write("caff", 0, "ascii");
  assert.match(validateAudioBuffer(cafPayload) ?? "", /could not read/i);

  assert.equal(validateAudioBuffer(buildM4aWithMdat(2000)), null);
  assert.equal(validateAudioBuffer(buildWavWithPcm(2000)), null);

  assert.match(
    validateAudioBuffer(Buffer.alloc(MIN_AUDIO_BYTES, 1)) ?? "",
    /could not read/i,
  );
});

test("validateRecordingDurationMs rejects very short holds", () => {
  assert.match(validateRecordingDurationMs(50) ?? "", /too short/i);
  assert.equal(validateRecordingDurationMs(250), null);
});
