import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeDetectedLanguage,
  resolveTargetLanguage,
  shouldSkipTranslation,
} from "./languageDetection.js";

test("normalizeDetectedLanguage maps supported ISO codes", () => {
  assert.equal(normalizeDetectedLanguage("en"), "en");
  assert.equal(normalizeDetectedLanguage("EN"), "en");
  assert.equal(normalizeDetectedLanguage("he"), "he");
  assert.equal(normalizeDetectedLanguage("ru"), "ru");
  assert.equal(normalizeDetectedLanguage("en-US"), "en");
  assert.equal(normalizeDetectedLanguage("fr"), null);
  assert.equal(normalizeDetectedLanguage(""), null);
});

test("resolveTargetLanguage falls back to English", () => {
  assert.equal(resolveTargetLanguage("he"), "he");
  assert.equal(resolveTargetLanguage(undefined), "en");
  assert.equal(resolveTargetLanguage("de"), "en");
});

test("shouldSkipTranslation skips when source and target match", () => {
  assert.equal(shouldSkipTranslation("en", "en"), true);
  assert.equal(shouldSkipTranslation("he", "ru"), false);
});
