import assert from "node:assert/strict";
import test from "node:test";

import {
  canStartTalking,
  getSelfMicHint,
  getSelfMicLabel,
  getTurnLabel,
} from "./sessionScreenState.js";

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

test("getSelfMicLabel reflects mute state", () => {
  assert.equal(getSelfMicLabel(false), "Mic on");
  assert.equal(getSelfMicLabel(true), "Mic off");
});

test("getSelfMicHint explains push-to-talk vs muted", () => {
  assert.match(getSelfMicHint(false), /Push-to-talk/i);
  assert.match(getSelfMicHint(true), /Unmute/i);
});

test("getTurnLabel shows mic off when self-muted", () => {
  assert.equal(
    getTurnLabel({
      participants: 2,
      isProcessing: false,
      isMyTurn: false,
      isOpenTurn: true,
      isSelfMuted: true,
    }),
    "Mic off",
  );
});

test("canStartTalking is false when self-muted", () => {
  assert.equal(
    canStartTalking({
      status: "connected",
      participants: 2,
      isProcessing: false,
      isRecording: false,
      isOpenTurn: true,
      isMyTurn: false,
      isSelfMuted: true,
    }),
    false,
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
