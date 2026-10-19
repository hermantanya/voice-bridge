import assert from "node:assert/strict";
import test from "node:test";

import { shouldTranslatePartial } from "./partialTranslationThrottle.js";

test("shouldTranslatePartial throttles by interval and char delta", () => {
  assert.equal(
    shouldTranslatePartial({
      sourceText: "hi",
      lastTranslatedSource: "",
      lastTranslateAtMs: 0,
      nowMs: 1_000,
    }),
    false,
  );

  assert.equal(
    shouldTranslatePartial({
      sourceText: "hello there friend",
      lastTranslatedSource: "",
      lastTranslateAtMs: 0,
      nowMs: 1_000,
    }),
    true,
  );

  assert.equal(
    shouldTranslatePartial({
      sourceText: "hello there friend",
      lastTranslatedSource: "hello there friend",
      lastTranslateAtMs: 0,
      nowMs: 1_000,
    }),
    false,
  );

  assert.equal(
    shouldTranslatePartial({
      sourceText: "hello there friend again",
      lastTranslatedSource: "hello there friend",
      lastTranslateAtMs: 900,
      nowMs: 1_000,
    }),
    false,
  );
});
