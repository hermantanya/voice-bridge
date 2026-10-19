import assert from "node:assert/strict";
import test from "node:test";

import {
  effectiveConversationMode,
  getSessionModeSubtitle,
  isHandsFreeComingSoon,
} from "./conversationMode.js";

test("effectiveConversationMode passes through stored preference", () => {
  assert.equal(effectiveConversationMode("push_to_talk"), "push_to_talk");
  assert.equal(effectiveConversationMode("hands_free"), "hands_free");
});

test("hands-free is no longer treated as coming soon", () => {
  assert.equal(isHandsFreeComingSoon("hands_free"), false);
  assert.match(getSessionModeSubtitle("hands_free"), /Hands-free/i);
});
