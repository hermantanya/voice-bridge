import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  appendTranscriptIfNew,
  applyTranslationResultToTranscript,
  applyTranslationSentToTranscript,
  flushPartnerPartialToTranscript,
  partnerPartialFromEvent,
  transcriptKey,
} from "./transcriptState.js";

describe("transcriptState", () => {
  test("appendTranscriptIfNew dedupes by direction and turnId", () => {
    const seen = new Set<string>();
    const payload = {
      turnId: "a-1",
      fromParticipantId: "speaker",
      sourceText: "hello",
      translatedText: "shalom",
    };

    const first = appendTranscriptIfNew([], seen, "received", payload, 40);
    assert.equal(first.entries.length, 1);
    assert.equal(seen.has(transcriptKey("received", "a-1")), true);

    const second = appendTranscriptIfNew(
      first.entries,
      seen,
      "received",
      payload,
      80,
    );
    assert.equal(second.entries.length, 1);
  });

  test("translation_transcript and translation_result share one received row", () => {
    const seen = new Set<string>();
    const base = {
      turnId: "a-2",
      fromParticipantId: "speaker",
      sourceText: "hi",
      translatedText: "shalom",
    };

    const afterTranscript = appendTranscriptIfNew(
      [],
      seen,
      "received",
      base,
      30,
    );
    const afterResult = applyTranslationResultToTranscript(
      afterTranscript.entries,
      seen,
      { ...base, latencyMs: 120 },
    );

    assert.equal(afterResult.entries.length, 1);
    assert.equal(afterResult.entries[0]?.latencyMs, 120);
    assert.equal(afterResult.entries[0]?.translatedText, "shalom");
  });

  test("translation_result appends when transcript event was missed", () => {
    const seen = new Set<string>();
    const afterResult = applyTranslationResultToTranscript([], seen, {
      turnId: "a-3",
      fromParticipantId: "speaker",
      sourceText: "hey",
      translatedText: "hola",
      latencyMs: 90,
    });

    assert.equal(afterResult.entries.length, 1);
    assert.equal(afterResult.entries[0]?.direction, "received");
  });

  test("translation_sent_transcript and translation_sent dedupe sent rows", () => {
    const seen = new Set<string>();
    const base = {
      turnId: "me-1",
      fromParticipantId: "me",
      sourceText: "hello",
      translatedText: "shalom",
    };

    const afterEarly = appendTranscriptIfNew([], seen, "sent", base, 25);
    const afterFinal = applyTranslationSentToTranscript(
      afterEarly.entries,
      seen,
      { ...base, latencyMs: 110 },
    );

    assert.equal(afterFinal.entries.length, 1);
    assert.equal(afterFinal.entries[0]?.latencyMs, 110);
  });

  test("flushPartnerPartialToTranscript preserves live partner text", () => {
    const partial = partnerPartialFromEvent({
      turnId: "p-1",
      fromParticipantId: "partner",
      sourceText: "listening",
      translatedText: "partial translation",
    });
    assert.ok(partial);

    const seen = new Set<string>();
    const flushed = flushPartnerPartialToTranscript([], seen, partial);
    assert.equal(flushed.entries.length, 1);
    assert.equal(flushed.entries[0]?.translatedText, "partial translation");
  });
});
