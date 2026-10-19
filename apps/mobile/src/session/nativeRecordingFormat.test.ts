import assert from "node:assert/strict";
import test from "node:test";

import {
  detectUploadFormatFromBase64,
  isDeliverableRecording,
  nativeRecordingFormatForUpload,
  resolveNativeUploadFormat,
} from "./nativeRecordingFormat.js";

test("nativeRecordingFormatForUpload preserves caf URIs for the server", () => {
  assert.equal(
    nativeRecordingFormatForUpload("file:///var/recording.caf"),
    "caf",
  );
  assert.equal(
    nativeRecordingFormatForUpload(
      "file:///var/recording-uuid.m4a",
    ),
    "m4a",
  );
});

function base64FromBytes(bytes: number[]): string {
  const binary = String.fromCharCode(...bytes);
  const encode =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa.bind(globalThis)
      : null;
  if (!encode) {
    throw new Error("btoa unavailable in test runtime");
  }
  return encode(binary);
}

test("detectUploadFormatFromBase64 identifies m4a and caf payloads", () => {
  const m4aHeader = base64FromBytes([
    0, 0, 0, 28, ...Array.from("ftyp").map((c) => c.charCodeAt(0)), 109, 112,
    52, 50,
  ]);
  assert.equal(detectUploadFormatFromBase64(m4aHeader), "m4a");
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

test("isDeliverableRecording rejects short or empty payloads", () => {
  const enoughBase64 = base64FromBytes([
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
  assert.equal(isDeliverableRecording("", 500), false);
  assert.equal(isDeliverableRecording(enoughBase64, 100), false);
  assert.equal(isDeliverableRecording(enoughBase64, 400), true);
  assert.equal(isDeliverableRecording("A".repeat(2200), 400), false);
});
