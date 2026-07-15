import type { Server, Socket } from "socket.io";

import { runTranslationPipeline } from "../pipeline/index.js";

type JoinRoomPayload = {
  roomCode: string;
  speakLang?: string;
  hearLang?: string;
};

type AudioChunkPayload = {
  audioBase64: string;
  format?: string;
  sourceLang?: string;
  targetLang?: string;
};

type TurnPhase = "waiting" | "speaking" | "processing";

type TurnState = {
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
};

type RoomState = {
  participantIds: Set<string>;
  hostId: string | null;
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
};

const rooms = new Map<string, RoomState>();

function createRoomState(): RoomState {
  return {
    participantIds: new Set(),
    hostId: null,
    turnParticipantId: null,
    phase: "waiting",
    version: 0,
  };
}

function getRoomTurnState(room: RoomState): TurnState {
  return {
    turnParticipantId: room.turnParticipantId,
    phase: room.phase,
    version: room.version,
  };
}

function bumpTurnState(room: RoomState): TurnState {
  room.version += 1;
  return getRoomTurnState(room);
}

function emitTurnState(io: Server, roomCode: string, room: RoomState): void {
  const turnState = bumpTurnState(room);
  io.to(roomCode).emit("turn_state", {
    roomCode,
    ...turnState,
  });
}

function getOtherParticipantId(
  room: RoomState,
  participantId: string,
): string | null {
  for (const id of room.participantIds) {
    if (id !== participantId) {
      return id;
    }
  }
  return null;
}

function syncRoomParticipants(
  room: RoomState,
  liveSocketIds: Set<string>,
  joiningSocketId: string,
): void {
  for (const id of [...room.participantIds]) {
    if (!liveSocketIds.has(id)) {
      room.participantIds.delete(id);
    }
  }

  room.participantIds.add(joiningSocketId);

  if (!room.hostId || !room.participantIds.has(room.hostId)) {
    room.hostId = room.participantIds.values().next().value ?? joiningSocketId;
  }

  if (
    room.turnParticipantId &&
    !room.participantIds.has(room.turnParticipantId)
  ) {
    room.turnParticipantId = null;
    room.phase = "waiting";
  }
}

function startTurnForRoom(io: Server, roomCode: string, room: RoomState): void {
  if (room.participantIds.size < 2 || !room.hostId) {
    room.turnParticipantId = null;
    room.phase = "waiting";
    emitTurnState(io, roomCode, room);
    return;
  }

  room.turnParticipantId = room.hostId;
  room.phase = "speaking";
  emitTurnState(io, roomCode, room);
}

function ensureActiveTurn(io: Server, roomCode: string, room: RoomState): void {
  if (room.participantIds.size >= 2 && room.phase === "waiting") {
    startTurnForRoom(io, roomCode, room);
  }
}

function passTurnToPartner(
  io: Server,
  roomCode: string,
  room: RoomState,
  currentSpeakerId: string,
): void {
  const nextSpeakerId = getOtherParticipantId(room, currentSpeakerId);

  if (!nextSpeakerId || room.participantIds.size < 2) {
    room.turnParticipantId = null;
    room.phase = "waiting";
  } else {
    room.turnParticipantId = nextSpeakerId;
    room.phase = "speaking";
  }

  emitTurnState(io, roomCode, room);
}

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`client connected: ${socket.id}`);

    socket.on("join_room", async (payload: JoinRoomPayload) => {
      const { roomCode, speakLang, hearLang } = payload;

      if (!roomCode?.trim()) {
        socket.emit("error", { message: "roomCode is required" });
        return;
      }

      const code = roomCode.trim().toUpperCase();
      const myLang = speakLang ?? hearLang ?? "en";

      socket.join(code);

      if (!rooms.has(code)) {
        rooms.set(code, createRoomState());
      }

      const room = rooms.get(code)!;
      const socketsInRoom = await io.in(code).fetchSockets();
      const liveSocketIds = new Set(socketsInRoom.map((s) => s.id));

      syncRoomParticipants(room, liveSocketIds, socket.id);

      socket.data.roomCode = code;
      socket.data.speakLang = myLang;
      socket.data.hearLang = myLang;

      ensureActiveTurn(io, code, room);

      const participants = room.participantIds.size;
      const partnerSocket = socketsInRoom.find((s) => s.id !== socket.id);
      const partnerLang = partnerSocket?.data.speakLang as string | undefined;
      const turnState = getRoomTurnState(room);

      socket.emit("joined_room", {
        roomCode: code,
        participantId: socket.id,
        participants,
        myLang,
        partnerLang,
        turnState,
      });

      socket.to(code).emit("participant_joined", {
        participantId: socket.id,
        participants,
        myLang,
        turnState,
      });

      console.log(
        `socket ${socket.id} joined room ${code} (${participants} participants, lang=${myLang}, turn=${room.turnParticipantId})`,
      );
    });

    socket.on("audio_chunk", async (payload: AudioChunkPayload) => {
      const code = socket.data.roomCode as string | undefined;

      if (!code) {
        socket.emit("error", { message: "Join a room before sending audio" });
        return;
      }

      if (!payload?.audioBase64) {
        socket.emit("error", { message: "audioBase64 is required" });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        socket.emit("error", { message: "Room not found" });
        return;
      }

      if (room.phase !== "speaking" || room.turnParticipantId !== socket.id) {
        socket.emit("error", { message: "Not your turn" });
        return;
      }

      room.phase = "processing";
      emitTurnState(io, code, room);

      try {
        const audio = Buffer.from(payload.audioBase64, "base64");
        const sourceLang =
          payload.sourceLang ?? (socket.data.speakLang as string) ?? "en";

        const socketsInRoom = await io.in(code).fetchSockets();
        const listener = socketsInRoom.find((s) => s.id !== socket.id);
        const targetLang = listener
          ? ((listener.data.speakLang as string) ?? "en")
          : ((payload.targetLang as string) ?? "en");

        const result = await runTranslationPipeline({
          audio,
          sourceLang,
          targetLang,
          format: payload.format ?? "webm",
        });

        const translationResult = {
          roomCode: code,
          fromParticipantId: socket.id,
          sourceLang: result.sourceLang,
          targetLang: result.targetLang,
          sourceText: result.sourceText,
          translatedText: result.translatedText,
          audioBase64: result.audio.toString("base64"),
          audioFormat: result.audioFormat,
          latencyMs: result.latencyMs,
        };

        socket.to(code).emit("translation_result", translationResult);
        socket.emit("translation_sent", translationResult);
        passTurnToPartner(io, code, room, socket.id);
      } catch (error) {
        console.error(`audio_chunk error for ${socket.id}:`, error);

        room.turnParticipantId = socket.id;
        room.phase = "speaking";
        emitTurnState(io, code, room);

        socket.emit("error", {
          message: error instanceof Error ? error.message : "Translation failed",
        });
      }
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode as string | undefined;

      if (code && rooms.has(code)) {
        const room = rooms.get(code)!;
        room.participantIds.delete(socket.id);

        if (room.hostId === socket.id) {
          room.hostId = room.participantIds.values().next().value ?? null;
        }

        if (room.participantIds.size === 0) {
          rooms.delete(code);
        } else {
          if (room.turnParticipantId === socket.id) {
            room.turnParticipantId = null;
            room.phase = "waiting";
          }

          if (room.participantIds.size === 1) {
            room.turnParticipantId = null;
            room.phase = "waiting";
          }

          socket.to(code).emit("participant_left", {
            participantId: socket.id,
            participants: room.participantIds.size,
            turnState: getRoomTurnState(room),
          });

          emitTurnState(io, code, room);
        }
      }

      console.log(`client disconnected: ${socket.id}`);
    });
  });
}
