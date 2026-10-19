import assert from "node:assert/strict";
import test from "node:test";

import {
  detectUploadFormatFromBase64,
  isDeliverableRecording,
  nativeRecordingFormatForUpload,
  resolveNativeUploadFormat,
} from "./nativeRecordingFormat.js";

test("nativeRecordingFormatForUpload preserves caf and wav URIs for the server", () => {
  assert.equal(
    nativeRecordingFormatForUpload("file:///var/recording.caf"),
    "caf",
  );
  assert.equal(
    nativeRecordingFormatForUpload("file:///var/recording.wav"),
    "wav",
  );
  assert.equal(
    nativeRecordingFormatForUpload("file:///var/recording-uuid.m4a"),
    "m4a",
  );
});

function base64FromBytes(bytes: number[]): string {
  return Buffer.from(Uint8Array.from(bytes)).toString("base64");
}

function buildM4aWithMdat(payloadBytes: number): string {
  const ftyp = Array<number>(32).fill(0);
  ftyp[3] = 32;
  Array.from("ftyp").forEach((c, i) => {
    ftyp[4 + i] = c.charCodeAt(0);
  });
  Array.from("mp42").forEach((c, i) => {
    ftyp[8 + i] = c.charCodeAt(0);
  });
  const mdatSize = 8 + payloadBytes;
  const mdat = [
    (mdatSize >> 24) & 255,
    (mdatSize >> 16) & 255,
    (mdatSize >> 8) & 255,
    mdatSize & 255,
    ...Array.from("mdat").map((c) => c.charCodeAt(0)),
    ...Array(payloadBytes).fill(0xab),
  ];
  return base64FromBytes([...ftyp, ...mdat]);
}

function buildWavWithPcm(pcmBytes: number): string {
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
  return Buffer.concat([header, pcm]).toString("base64");
}

test("detectUploadFormatFromBase64 identifies m4a, wav, and caf payloads", () => {
  const m4aHeader = base64FromBytes([
    0, 0, 0, 28, ...Array.from("ftyp").map((c) => c.charCodeAt(0)), 109, 112,
    52, 50,
  ]);
  assert.equal(detectUploadFormatFromBase64(m4aHeader), "m4a");
  assert.equal(detectUploadFormatFromBase64(buildWavWithPcm(64)), "wav");
  assert.equal(
    detectUploadFormatFromBase64(
      base64FromBytes([...Array.from("caff").map((c) => c.charCodeAt(0))]),
    ),
    "caf",
  );
});

test("resolveNativeUploadFormat prefers bytes over misleading URI", () => {
  const cafHeader = base64FromBytes([
    ...Array.from("caff").map((c) => c.charCodeAt(0)),
    ...Array(32).fill(0),
  ]);
  assert.equal(
    resolveNativeUploadFormat("file:///var/recording.m4a", cafHeader),
    "caf",
  );
});

test("isDeliverableRecording rejects short, caf, or header-only m4a", () => {
  const m4aWithAudio = buildM4aWithMdat(2000);
  const headerOnlyM4a = base64FromBytes([
    0,
    0,
    0,
    28,
    ...Array.from("ftyp").map((c) => c.charCodeAt(0)),
    109,
    112,
    52,
    50,
    ...Array(2000).fill(1),
  ]);
  const wavWithAudio = buildWavWithPcm(2000);

  assert.equal(isDeliverableRecording("", 500), false);
  assert.equal(isDeliverableRecording(m4aWithAudio, 100), false);
  assert.equal(
    isDeliverableRecording(m4aWithAudio, 400),
    true,
    "m4a with mdat should be deliverable",
  );
  assert.equal(
    isDeliverableRecording(wavWithAudio, 400),
    true,
    "wav with pcm data should be deliverable",
  );
  assert.equal(isDeliverableRecording(headerOnlyM4a, 400), false);
  assert.equal(isDeliverableRecording("A".repeat(2200), 400), false);
});
