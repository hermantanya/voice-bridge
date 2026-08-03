import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVoiceCloneName,
  enrollmentPreviewText,
  enrollmentSampleFilename,
  MIN_ENROLLMENT_DURATION_MS,
  validateVoiceEnrollmentRequest,
  validateVoicePreviewRequest,
} from "./enrollment.js";

test("validateVoiceEnrollmentRequest requires audio and minimum duration", () => {
  const audioBase64 = Buffer.from("hello").toString("base64");

  assert.deepEqual(
    validateVoiceEnrollmentRequest({
      audioBase64,
      format: "webm",
      language: "en",
      durationMs: MIN_ENROLLMENT_DURATION_MS - 1,
    }),
    {
      ok: false,
      error: `Record at least ${MIN_ENROLLMENT_DURATION_MS / 1000} seconds`,
    },
  );

  const valid = validateVoiceEnrollmentRequest({
    audioBase64,
    format: "webm",
    language: "he",
    gender: "female",
    durationMs: MIN_ENROLLMENT_DURATION_MS,
    replaceVoiceId: "old-voice",
  });

  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.language, "he");
    assert.equal(valid.gender, "female");
    assert.equal(valid.replaceVoiceId, "old-voice");
    assert.equal(valid.format, "webm");
  }
});

test("enrollment helpers build filenames and preview text", () => {
  assert.equal(enrollmentSampleFilename("m4a"), "voice-bridge-enrollment.m4a");
  assert.match(buildVoiceCloneName("ru"), /^Voice Bridge RU /);
  assert.match(enrollmentPreviewText("he"), /Voice Bridge/);
});

test("validateVoicePreviewRequest requires voiceId and language", () => {
  assert.deepEqual(validateVoicePreviewRequest({}), {
    ok: false,
    error: "voiceId is required",
  });

  assert.deepEqual(
    validateVoicePreviewRequest({ voiceId: "voice-123", language: "fr" }),
    {
      ok: false,
      error: "language must be en, he, or ru",
    },
  );

  assert.deepEqual(
    validateVoicePreviewRequest({
      voiceId: "voice-123",
      language: "en",
      gender: "male",
    }),
    {
      ok: true,
      voiceId: "voice-123",
      language: "en",
      gender: "male",
    },
  );
});
