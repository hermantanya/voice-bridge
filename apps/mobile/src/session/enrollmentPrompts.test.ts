import assert from "node:assert/strict";
import test from "node:test";

import {
  enrollmentDurationHint,
  estimatedEnrollmentReadSeconds,
  formatEnrollmentDuration,
  getEnrollmentPrompt,
  hasMinimumEnrollmentDuration,
  MIN_ENROLLMENT_DURATION_MS,
} from "./enrollmentPrompts.js";

test("getEnrollmentPrompt returns gender-specific Hebrew scripts", () => {
  assert.equal(getEnrollmentPrompt("he", "female").paragraphs.length, 6);
  assert.match(
    getEnrollmentPrompt("he", "female").paragraphs[1],
    /מקליטה/,
  );
  assert.match(getEnrollmentPrompt("he", "male").paragraphs[1], /מקליט /);
});

test("estimatedEnrollmentReadSeconds targets about a minute of speech", () => {
  assert.ok(estimatedEnrollmentReadSeconds("en", "female") >= 45);
  assert.ok(estimatedEnrollmentReadSeconds("he", "female") >= 45);
});

test("formatEnrollmentDuration renders mm:ss", () => {
  assert.equal(formatEnrollmentDuration(0), "0:00");
  assert.equal(formatEnrollmentDuration(65_000), "1:05");
});

test("hasMinimumEnrollmentDuration enforces 30 second minimum", () => {
  assert.equal(
    hasMinimumEnrollmentDuration(MIN_ENROLLMENT_DURATION_MS - 1),
    false,
  );
  assert.equal(hasMinimumEnrollmentDuration(MIN_ENROLLMENT_DURATION_MS), true);
});

test("enrollmentDurationHint explains remaining time", () => {
  assert.match(enrollmentDurationHint(5_000), /25s more needed/);
  assert.match(enrollmentDurationHint(MIN_ENROLLMENT_DURATION_MS), /Ready to create/);
});
