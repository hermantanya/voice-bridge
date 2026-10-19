import assert from "node:assert/strict";
import test from "node:test";

import { canStartTalking, getTurnLabel } from "./sessionScreenState.js";

test("getTurnLabel shows waiting for partner when alone in room", () => {
  assert.equal(
    getTurnLabel({
      participants: 1,
      isProcessing: false,
      isMyTurn: false,
      isOpenTurn: true,
    }),
    "Waiting for partner",
  );
});

test("getTurnLabel shows ready when two participants and floor is open", () => {
  assert.equal(
    getTurnLabel({
      participants: 2,
      isProcessing: false,
      isMyTurn: false,
      isOpenTurn: true,
    }),
    "Ready: hold to talk",
  );
});

test("canStartTalking requires two participants", () => {
  assert.equal(
    canStartTalking({
      status: "connected",
      participants: 1,
      isProcessing: false,
      isRecording: false,
      isOpenTurn: true,
      isMyTurn: false,
    }),
    false,
  );

  assert.equal(
    canStartTalking({
      status: "connected",
      participants: 2,
      isProcessing: false,
      isRecording: false,
      isOpenTurn: true,
      isMyTurn: false,
    }),
    true,
  );
});

test("canStartTalking is false while recording", () => {
  assert.equal(
    canStartTalking({
      status: "connected",
      participants: 2,
      isProcessing: false,
      isRecording: true,
      isOpenTurn: true,
      isMyTurn: true,
    }),
    false,
  );
});
