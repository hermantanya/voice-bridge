import assert from "node:assert/strict";
import test from "node:test";

import {
  handsFreeListenRecordingOptions,
  handsFreeUtteranceRecordingOptions,
} from "./handsFreeRecordingOptions.js";
import { pushToTalkRecordingOptions } from "./pushToTalkRecordingOptions.js";

test("hands-free utterance options match push-to-talk options", () => {
  const ptt = pushToTalkRecordingOptions();
  const utterance = handsFreeUtteranceRecordingOptions();
  assert.deepEqual(utterance, ptt);
});

test("hands-free listen enables metering on top of push-to-talk options", () => {
  const listen = handsFreeListenRecordingOptions();
  assert.equal(listen.isMeteringEnabled, true);
  assert.equal(listen.extension, pushToTalkRecordingOptions().extension);
});
