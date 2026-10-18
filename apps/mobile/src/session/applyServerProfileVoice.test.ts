import assert from "node:assert/strict";
import { test } from "node:test";

import { applyServerProfileVoice } from "./applyServerProfileVoice.js";

test("applyServerProfileVoice copies server voice when different", async () => {
  const calls: (string | null)[] = [];
  await applyServerProfileVoice("server-voice", "local-voice", async (id) => {
    calls.push(id);
  });
  assert.deepEqual(calls, ["server-voice"]);
});

test("applyServerProfileVoice clears local when server has no voice", async () => {
  const calls: (string | null)[] = [];
  await applyServerProfileVoice(null, "local-voice", async (id) => {
    calls.push(id);
  });
  assert.deepEqual(calls, [null]);
});

test("applyServerProfileVoice is noop when already aligned", async () => {
  let calls = 0;
  await applyServerProfileVoice("same", "same", async () => {
    calls += 1;
  });
  assert.equal(calls, 0);
});
