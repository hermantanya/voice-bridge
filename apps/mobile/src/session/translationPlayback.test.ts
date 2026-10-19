import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLiveTranscriptionUnavailableMessage,
  shouldPlayTranslationAudio,
} from "./translationPlayback.js";

describe("shouldPlayTranslationAudio", () => {
  it("never plays translation_sent to the speaker", () => {
    assert.equal(
      shouldPlayTranslationAudio("me-1", {
        kind: "translation_sent",
        fromParticipantId: "me-1",
        audioBase64: "abc",
      }),
      false,
    );
  });

  it("plays partner translation_result", () => {
    assert.equal(
      shouldPlayTranslationAudio("me-1", {
        kind: "translation_result",
        fromParticipantId: "partner-1",
        audioBase64: "abc",
      }),
      true,
    );
    assert.equal(
      shouldPlayTranslationAudio("me-1", {
        kind: "translation_result",
        fromParticipantId: "me-1",
        audioBase64: "abc",
      }),
      false,
    );
  });

  it("skips partial_translation_audio echoed to the speaker", () => {
    assert.equal(
      shouldPlayTranslationAudio("me-1", {
        kind: "partial_translation_audio",
        fromParticipantId: "me-1",
        role: "speaker",
        audioBase64: "abc",
      }),
      false,
    );
    assert.equal(
      shouldPlayTranslationAudio("me-1", {
        kind: "partial_translation_audio",
        fromParticipantId: "partner-1",
        audioBase64: "abc",
      }),
      true,
    );
  });
});

describe("isLiveTranscriptionUnavailableMessage", () => {
  it("detects streaming ASR errors", () => {
    assert.equal(
      isLiveTranscriptionUnavailableMessage(
        "Live transcription unavailable (Error committing input audio buffer: buffer too small). Translation will finish when you release.",
      ),
      true,
    );
  });
});
