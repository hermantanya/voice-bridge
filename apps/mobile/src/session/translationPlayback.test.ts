import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldPlayTranslationAudio } from "./translationPlayback.js";

describe("shouldPlayTranslationAudio", () => {
  const me = "socket-self";
  const partner = "socket-partner";

  test("plays partner translation_result", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "translation_result",
        fromParticipantId: partner,
        turnId: "turn-1",
        audioBase64: "abc",
      }),
      true,
    );
  });

  test("never plays translation_sent (speaker confirmation)", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "translation_sent",
        fromParticipantId: me,
        turnId: "turn-1",
        audioBase64: "abc",
      }),
      false,
    );
  });

  test("does not play own translation_result", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "translation_result",
        fromParticipantId: me,
        turnId: "turn-1",
        audioBase64: "abc",
      }),
      false,
    );
  });

  test("does not play partial_translation_audio marked for speaker", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "partial_translation_audio",
        fromParticipantId: me,
        role: "speaker",
        audioBase64: "abc",
      }),
      false,
    );
  });

  test("plays listener partial_translation_audio from partner", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "partial_translation_audio",
        fromParticipantId: partner,
        audioBase64: "abc",
      }),
      true,
    );
  });

  test("respects skippedTts and empty audio", () => {
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "translation_result",
        fromParticipantId: partner,
        audioBase64: "",
      }),
      false,
    );
    assert.equal(
      shouldPlayTranslationAudio(me, {
        kind: "translation_result",
        fromParticipantId: partner,
        audioBase64: "abc",
        skippedTts: true,
      }),
      false,
    );
  });
});
