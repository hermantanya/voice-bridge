import assert from "node:assert/strict";
import test from "node:test";

import {
  getNativeRecordingUri,
  nativeRecordingDurationMs,
} from "./nativeRecordingUri.js";

test("getNativeRecordingUri prefers recorder uri then status url", () => {
  assert.equal(
    getNativeRecordingUri({
      uri: "file:///a.m4a",
      getStatus: () => ({ url: "file:///b.m4a" }),
    }),
    "file:///a.m4a",
  );
  assert.equal(
    getNativeRecordingUri({
      uri: null,
      getStatus: () => ({ url: "file:///b.m4a" }),
    }),
    "file:///b.m4a",
  );
});

test("nativeRecordingDurationMs uses the larger of status and wall clock", () => {
  assert.equal(
    nativeRecordingDurationMs(
      { uri: null, getStatus: () => ({ url: null, durationMillis: 820 }) },
      400,
    ),
    820,
  );
  assert.equal(
    nativeRecordingDurationMs(
      { uri: null, getStatus: () => ({ url: null, durationMillis: 120 }) },
      450,
    ),
    450,
  );
});
