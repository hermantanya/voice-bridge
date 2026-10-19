import assert from "node:assert/strict";
import test from "node:test";

import {
  registerHandsFreeMicRelease,
  releaseHandsFreeMicBeforePushToTalk,
} from "./nativeMicCoordinator.js";

test("releaseHandsFreeMicBeforePushToTalk awaits registered hands-free teardown", async () => {
  let released = false;
  registerHandsFreeMicRelease(async () => {
    released = true;
  });

  await releaseHandsFreeMicBeforePushToTalk();
  assert.equal(released, true);

  registerHandsFreeMicRelease(null);
});

test("releaseHandsFreeMicBeforePushToTalk is a no-op when nothing is registered", async () => {
  registerHandsFreeMicRelease(null);
  await releaseHandsFreeMicBeforePushToTalk();
});
