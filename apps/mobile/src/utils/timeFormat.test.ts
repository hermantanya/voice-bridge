import assert from "node:assert/strict";
import test from "node:test";

import {
  formatActiveConversationDuration,
  formatRelativeTime,
  formatSessionDuration,
} from "./timeFormat.js";

test("formatRelativeTime shows just now for recent timestamps", () => {
  assert.equal(formatRelativeTime(1000, 3000), "just now");
});

test("formatRelativeTime shows seconds and minutes", () => {
  assert.equal(formatRelativeTime(0, 10_000), "10 sec ago");
  assert.equal(formatRelativeTime(0, 90_000), "1 min ago");
});

test("formatSessionDuration formats mm:ss", () => {
  assert.equal(formatSessionDuration(0, 65_000), "1:05");
});

test("formatActiveConversationDuration formats hh:mm:ss when needed", () => {
  assert.equal(formatActiveConversationDuration(3_661_000), "1:01:01");
});
