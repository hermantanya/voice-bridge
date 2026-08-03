type RoomState = {
  participantIds: Set<string>;
};

/**
 * Update room membership on join without evicting peers that fetchSockets
 * may not include yet during concurrent joins.
 */
export function reconcileParticipantsOnJoin(
  room: RoomState,
  socketsInRoom: Array<{ id: string }>,
  joiningSocketId: string,
): number {
  const liveIds = new Set(socketsInRoom.map((socket) => socket.id));

  room.participantIds.add(joiningSocketId);

  for (const id of liveIds) {
    room.participantIds.add(id);
  }

  return Math.max(room.participantIds.size, liveIds.size);
}

export function removeParticipant(room: RoomState, socketId: string): number {
  room.participantIds.delete(socketId);
  return room.participantIds.size;
}

/**
 * Merge live sockets into tracked membership without evicting peers that
 * fetchSockets may omit right after a concurrent join.
 */
export function reconcileParticipantsFromLive(
  room: RoomState,
  socketsInRoom: Array<{ id: string }>,
): number {
  const liveIds = new Set(socketsInRoom.map((socket) => socket.id));

  for (const id of liveIds) {
    room.participantIds.add(id);
  }

  return Math.max(room.participantIds.size, liveIds.size);
}
