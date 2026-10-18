import assert from "node:assert/strict";
import { test } from "node:test";

import { createPgPoolConfig } from "./pgConfig.js";

test("createPgPoolConfig enables SSL for Supabase hosts", () => {
  const config = createPgPoolConfig(
    "postgresql://u:p@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
  );
  assert.deepEqual(config.ssl, { rejectUnauthorized: false });
});

test("createPgPoolConfig skips SSL for localhost", () => {
  const config = createPgPoolConfig(
    "postgresql://u:p@localhost:5432/postgres",
  );
  assert.equal(config.ssl, undefined);
});
