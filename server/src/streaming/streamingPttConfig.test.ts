import assert from "node:assert/strict";
import test from "node:test";

import {
  isServerStreamingPttEnabled,
  isStreamingPttAllowedForClient,
} from "./streamingPttConfig.js";

test("streaming PTT server flag", () => {
  const prev = process.env.STREAMING_PTT_ENABLED;
  process.env.STREAMING_PTT_ENABLED = "1";
  assert.equal(isServerStreamingPttEnabled(), true);
  assert.equal(isStreamingPttAllowedForClient(true), true);
  assert.equal(isStreamingPttAllowedForClient(false), false);
  process.env.STREAMING_PTT_ENABLED = prev;
});
