import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveConversationMode,
  getSessionModeSubtitle,
  isHandsFreeComingSoon,
} from "./conversationMode.js";

test("effectiveConversationMode always uses push-to-talk in session", () => {
  assert.equal(effectiveConversationMode("push_to_talk"), "push_to_talk");
  assert.equal(effectiveConversationMode("hands_free"), "push_to_talk");
});

test("hands-free preference shows coming soon in settings copy", () => {
  assert.equal(isHandsFreeComingSoon("hands_free"), true);
  assert.equal(isHandsFreeComingSoon("push_to_talk"), false);
  assert.match(getSessionModeSubtitle("hands_free"), /coming soon/i);
});
