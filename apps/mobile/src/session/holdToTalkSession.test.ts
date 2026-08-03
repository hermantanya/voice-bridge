import assert from "node:assert/strict";
import test from "node:test";

import {
  runHoldToTalkStart,
  shouldForceStopRecording,
  shouldReleaseHoldTimestamp,
} from "./holdToTalkSession.js";

function createDeps(overrides: Partial<Parameters<typeof runHoldToTalkStart>[0]> = {}) {
  const calls = {
    claimTurn: 0,
    releaseTurn: 0,
    startRecording: 0,
    stopRecording: 0,
  };

  let holding = true;

  const deps = {
    stillHolding: () => holding,
    claimTurn: async () => {
      calls.claimTurn += 1;
      return true;
    },
    releaseTurn: async () => {
      calls.releaseTurn += 1;
    },
    startRecording: async () => {
      calls.startRecording += 1;
    },
    stopRecording: async () => {
      calls.stopRecording += 1;
      return false;
    },
    ...overrides,
  };

  return {
    deps,
    calls,
    release: () => {
      holding = false;
    },
  };
}

test("runHoldToTalkStart returns recording when still holding", async () => {
  const { deps } = createDeps();
  assert.equal(await runHoldToTalkStart(deps), "recording");
});

test("runHoldToTalkStart releases turn when user lets go during claimTurn", async () => {
  const { deps, calls, release } = createDeps({
    claimTurn: async () => {
      release();
      return true;
    },
  });

  const result = await runHoldToTalkStart(deps);

  assert.equal(result, "cancelled_before_record");
  assert.equal(calls.releaseTurn, 1);
  assert.equal(calls.startRecording, 0);
});

test("runHoldToTalkStart releases turn when quick stop sends no audio", async () => {
  let stopRecordingCalls = 0;
  const { deps, calls, release } = createDeps({
    startRecording: async () => {
      release();
    },
    stopRecording: async () => {
      stopRecordingCalls += 1;
      return false;
    },
  });

  const result = await runHoldToTalkStart(deps);

  assert.equal(result, "stopped_after_record");
  assert.equal(stopRecordingCalls, 1);
  assert.equal(calls.releaseTurn, 1);
});

test("runHoldToTalkStart keeps turn when quick stop delivers audio", async () => {
  const { deps, calls, release } = createDeps({
    startRecording: async () => {
      release();
    },
    stopRecording: async () => true,
  });

  const result = await runHoldToTalkStart(deps);

  assert.equal(result, "stopped_after_record");
  assert.equal(calls.releaseTurn, 0);
});

test("runHoldToTalkStart returns denied when claimTurn fails", async () => {
  const { deps, calls } = createDeps({
    claimTurn: async () => false,
  });

  assert.equal(await runHoldToTalkStart(deps), "denied");
  assert.equal(calls.startRecording, 0);
});

test("shouldForceStopRecording stops orphan recordings when turn is lost", () => {
  assert.equal(
    shouldForceStopRecording({
      inSession: true,
      isMyTurn: false,
      isOpenTurn: false,
      isRecording: true,
    }),
    true,
  );
});

test("shouldReleaseHoldTimestamp clears timing for cancelled starts", () => {
  assert.equal(shouldReleaseHoldTimestamp("denied"), true);
  assert.equal(shouldReleaseHoldTimestamp("cancelled_before_record"), true);
  assert.equal(shouldReleaseHoldTimestamp("recording"), false);
});
