import assert from "node:assert/strict";
import test from "node:test";

import { createPartialTranslationScheduler } from "./partialTranslationScheduler.js";

test("partial translation scheduler debounces then flushes immediately", async () => {
  let runs = 0;
  const scheduler = createPartialTranslationScheduler({
    debounceMs: 50,
    run: async () => {
      runs += 1;
    },
  });

  scheduler.bump();
  scheduler.bump();
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(runs, 1);

  await scheduler.flush();
  assert.equal(runs, 2);

  scheduler.cancel();
});
