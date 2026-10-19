import assert from "node:assert/strict";
import test from "node:test";

import {
  isDeliverableRecording,
  nativeRecordingFormatForUpload,
} from "./nativeRecordingFormat.js";

test("nativeRecordingFormatForUpload remaps caf URIs to m4a", () => {
  assert.equal(
    nativeRecordingFormatForUpload("file:///var/recording.caf"),
    "m4a",
  );
  assert.equal(
    nativeRecordingFormatForUpload(
      "file:///var/recording-uuid.m4a",
    ),
    "m4a",
  );
});

test("isDeliverableRecording rejects short or empty payloads", () => {
  const enoughBase64 = "A".repeat(800);
  assert.equal(isDeliverableRecording("", 500), false);
  assert.equal(isDeliverableRecording(enoughBase64, 100), false);
  assert.equal(isDeliverableRecording(enoughBase64, 400), true);
});
