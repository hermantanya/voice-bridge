import assert from "node:assert/strict";
import test from "node:test";

import { VAD_MAX_UTTERANCE_MS, VAD_SILENCE_END_MS, VAD_SPEECH_START_MS } from "./vadConfig.js";
import {
  createInitialVadState,
  stepVadState,
} from "./vadStateMachine.js";

test("VAD stays listening until speech is sustained", () => {
  let state = createInitialVadState();
  const start = 1_000;
  let result = stepVadState(state, {
    meteringDb: -30,
    nowMs: start,
    deltaMs: 100,
  });
  state = result.state;
  assert.equal(result.startCapture, false);

  result = stepVadState(state, {
    meteringDb: -30,
    nowMs: start + VAD_SPEECH_START_MS,
    deltaMs: VAD_SPEECH_START_MS,
  });
  assert.equal(result.startCapture, true);
  assert.equal(result.state.phase, "capturing");
});

test("VAD ends capture after trailing silence", () => {
  let state = createInitialVadState();
  state = {
    phase: "capturing",
    speechAboveMs: VAD_SPEECH_START_MS,
    silenceBelowMs: 0,
    captureStartedAtMs: 5_000,
  };

  const result = stepVadState(state, {
    meteringDb: -55,
    nowMs: 5_000 + VAD_SILENCE_END_MS,
    deltaMs: VAD_SILENCE_END_MS,
  });

  assert.equal(result.endCapture, true);
  assert.equal(result.endReason, "silence");
  assert.equal(result.state.phase, "listening");
});

test("VAD ends capture at max duration", () => {
  const startedAt = 10_000;
  const state = {
    phase: "capturing" as const,
    speechAboveMs: 0,
    silenceBelowMs: 0,
    captureStartedAtMs: startedAt,
  };

  const result = stepVadState(state, {
    meteringDb: -30,
    nowMs: startedAt + VAD_MAX_UTTERANCE_MS,
    deltaMs: 100,
  });

  assert.equal(result.endCapture, true);
  assert.equal(result.endReason, "max_duration");
});
