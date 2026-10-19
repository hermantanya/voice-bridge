import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isLiveTranscriptionUnavailableMessage,
  shouldAutoPlayTranslationAudio,
  shouldPlayTranslationAudio,
  type TranslationPlaybackPrefs,
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

const basePrefs: TranslationPlaybackPrefs = {
  playTranslatedVoice: true,
  sameRoomTextFirst: true,
  sameRoomPlayFinalVoice: false,
  usingHeadphones: false,
};

describe("shouldAutoPlayTranslationAudio", () => {
  it("blocks partials in same-room in-person mode", () => {
    assert.equal(
      shouldAutoPlayTranslationAudio("me-1", basePrefs, {
        kind: "partial_translation_audio",
        fromParticipantId: "partner-1",
        audioBase64: "abc",
      }),
      false,
    );
  });

  it("allows partials in same-room when using headphones", () => {
    assert.equal(
      shouldAutoPlayTranslationAudio(
        "me-1",
        { ...basePrefs, usingHeadphones: true },
        {
          kind: "partial_translation_audio",
          fromParticipantId: "partner-1",
          audioBase64: "abc",
        },
      ),
      true,
    );
  });

  it("allows partials when same-room text-first is off", () => {
    assert.equal(
      shouldAutoPlayTranslationAudio(
        "me-1",
        { ...basePrefs, sameRoomTextFirst: false },
        {
          kind: "partial_translation_audio",
          fromParticipantId: "partner-1",
          audioBase64: "abc",
        },
      ),
      true,
    );
  });

  it("suppresses final TTS in-person until release when final voice is off", () => {
    assert.equal(
      shouldAutoPlayTranslationAudio(
        "me-1",
        { ...basePrefs, sameRoomPlayFinalVoice: true },
        {
          kind: "translation_result",
          fromParticipantId: "partner-1",
          audioBase64: "abc",
        },
        { partnerHoldActive: true },
      ),
      false,
    );
    assert.equal(
      shouldAutoPlayTranslationAudio(
        "me-1",
        { ...basePrefs, sameRoomPlayFinalVoice: true },
        {
          kind: "translation_result",
          fromParticipantId: "partner-1",
          audioBase64: "abc",
        },
        { partnerHoldActive: false },
      ),
      true,
    );
  });
});
