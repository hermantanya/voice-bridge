import assert from "node:assert/strict";
import test from "node:test";

import { signAuthToken, verifyAuthToken } from "./jwt.js";

test("sign and verify auth token round-trip", () => {
  const secret = "test-secret";
  const token = signAuthToken(
    { sub: "user-1", email: "user@example.com" },
    secret,
    3600,
  );

  const verified = verifyAuthToken(token, secret);
  assert.equal(verified.ok, true);
  if (verified.ok) {
    assert.equal(verified.payload.sub, "user-1");
    assert.equal(verified.payload.email, "user@example.com");
  }
});

test("verify rejects tampered token", () => {
  const token = signAuthToken(
    { sub: "user-1", email: "user@example.com" },
    "secret-a",
    3600,
  );
  const verified = verifyAuthToken(token, "secret-b");
  assert.equal(verified.ok, false);
});
