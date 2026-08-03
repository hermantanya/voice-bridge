import assert from "node:assert/strict";
import test from "node:test";

import {
  languageLabel,
  speakerGenderLabel,
  SPEAKER_GENDERS,
  LANGUAGES,
} from "./config.js";

test("languageLabel resolves known languages", () => {
  assert.equal(languageLabel("en"), "English");
  assert.equal(languageLabel("he"), "Hebrew");
  assert.equal(languageLabel("ru"), "Russian");
});

test("speakerGenderLabel resolves known genders", () => {
  assert.equal(speakerGenderLabel("female"), "Female");
  assert.equal(speakerGenderLabel("male"), "Male");
});

test("LANGUAGES includes English, Hebrew, and Russian", () => {
  assert.deepEqual(
    LANGUAGES.map((lang) => lang.code),
    ["en", "he", "ru"],
  );
});

test("SPEAKER_GENDERS includes female and male", () => {
  assert.deepEqual(
    SPEAKER_GENDERS.map((option) => option.value),
    ["female", "male"],
  );
});
