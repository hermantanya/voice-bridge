import assert from "node:assert/strict";
import test from "node:test";

import {
  getAudioConstraints,
  isRemotePhoneMic,
  isVirtualMicDevice,
  preferBuiltInMic,
} from "./microphoneDevices.js";

test("isRemotePhoneMic detects phone and continuity inputs", () => {
  assert.equal(isRemotePhoneMic("Tanya's iPhone Microphone"), true);
  assert.equal(isRemotePhoneMic("MacBook Pro Microphone"), false);
});

test("isVirtualMicDevice excludes default device ids", () => {
  assert.equal(isVirtualMicDevice("default"), true);
  assert.equal(isVirtualMicDevice("abc123"), false);
});

test("preferBuiltInMic prefers built-in over continuity phone", () => {
  const preferred = preferBuiltInMic([
    { deviceId: "phone", label: "Tanya's iPhone Microphone" },
    { deviceId: "built-in", label: "MacBook Pro Microphone" },
  ]);

  assert.equal(preferred?.deviceId, "built-in");
});

test("getAudioConstraints uses exact device id when requested", () => {
  assert.deepEqual(getAudioConstraints("mic-1", true), {
    audio: {
      deviceId: { exact: "mic-1" },
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
});
