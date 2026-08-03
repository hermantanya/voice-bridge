import assert from "node:assert/strict";
import test from "node:test";

import { readApiJson } from "./readApiJson.js";

test("readApiJson parses valid JSON bodies", async () => {
  const response = new Response(JSON.stringify({ voiceId: "abc" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

  const body = await readApiJson<{ voiceId: string }>(response);
  assert.equal(body.voiceId, "abc");
});

test("readApiJson surfaces HTML error bodies clearly", async () => {
  const response = new Response("<html>Not Found</html>", {
    status: 404,
    headers: { "Content-Type": "text/html" },
  });

  await assert.rejects(
    () => readApiJson(response),
    /Server error \(404\): <html>Not Found/,
  );
});
