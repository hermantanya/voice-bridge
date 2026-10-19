import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONVERSATION_MODE,
  parseConversationMode,
} from "./conversationMode.js";

test("parseConversationMode defaults to push_to_talk", () => {
  assert.equal(parseConversationMode(undefined), DEFAULT_CONVERSATION_MODE);
  assert.equal(parseConversationMode(null), DEFAULT_CONVERSATION_MODE);
  assert.equal(parseConversationMode(""), DEFAULT_CONVERSATION_MODE);
});

test("parseConversationMode accepts v2 modes", () => {
  assert.equal(parseConversationMode("push_to_talk"), "push_to_talk");
  assert.equal(parseConversationMode("hands_free"), "hands_free");
});

test("parseConversationMode rejects unknown values", () => {
  assert.equal(parseConversationMode("walkie"), null);
  assert.equal(parseConversationMode(1), null);
});
