import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileParticipantsOnJoin,
  removeParticipant,
} from "./roomParticipants.js";

function roomWith(ids: string[] = []) {
  return { participantIds: new Set(ids) };
}

test("reconcileParticipantsOnJoin adds the joining socket", () => {
  const room = roomWith();

  const participants = reconcileParticipantsOnJoin(room, [], "mobile");

  assert.equal(participants, 1);
  assert.deepEqual([...room.participantIds], ["mobile"]);
});

test("reconcileParticipantsOnJoin keeps an earlier joiner when fetchSockets is stale", () => {
  const room = roomWith(["desktop"]);

  const participants = reconcileParticipantsOnJoin(
    room,
    [{ id: "mobile" }],
    "mobile",
  );

  assert.equal(participants, 2);
  assert.deepEqual([...room.participantIds].sort(), ["desktop", "mobile"]);
});

test("reconcileParticipantsOnJoin reports the larger live and tracked count", () => {
  const room = roomWith(["desktop", "mobile"]);

  const participants = reconcileParticipantsOnJoin(
    room,
    [{ id: "desktop" }, { id: "mobile" }],
    "mobile",
  );

  assert.equal(participants, 2);
});

test("removeParticipant drops disconnected sockets", () => {
  const room = roomWith(["desktop", "mobile"]);

  const participants = removeParticipant(room, "desktop");

  assert.equal(participants, 1);
  assert.deepEqual([...room.participantIds], ["mobile"]);
});
