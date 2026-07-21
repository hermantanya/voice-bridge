import type { Server, Socket } from "socket.io";

import { runTranslationPipeline } from "../pipeline/index.js";
import {
  closeActivePipeline,
  createActiveConversationTracker,
  getActiveConversationMs,
  resolvePipelineStartMs,
  startActivePipeline,
  type ActiveConversationTracker,
} from "./activeConversation.js";
import { rejectIfAudioLimited, type SocketRateLimits } from "./rateLimit.js";

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
  recordingDurationMs?: number;
  recordingStartedAt?: number;
};

type TurnPhase = "waiting" | "speaking" | "processing";

type TurnState = {
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
};

type RoomState = {
  participantIds: Set<string>;
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
  activeConversation: ActiveConversationTracker;
  participantBillableMs: Map<string, number>;
  sessionStartedAt: number | null;
};

const rooms = new Map<string, RoomState>();

function createRoomState(): RoomState {
  return {
    participantIds: new Set(),
    turnParticipantId: null,
    phase: "waiting",
    version: 0,
    activeConversation: createActiveConversationTracker(),
    participantBillableMs: new Map(),
    sessionStartedAt: null,
  };
}

function ensureSessionStarted(room: RoomState): void {
  if (room.participantIds.size >= 2 && room.sessionStartedAt === null) {
    room.sessionStartedAt = Date.now();
  }
}

function clearSessionIfAlone(room: RoomState): void {
  if (room.participantIds.size < 2) {
    room.sessionStartedAt = null;
    room.activeConversation = createActiveConversationTracker();
    room.participantBillableMs.clear();
  }
}

function buildUsagePayload(room: RoomState) {
  const totalActiveConversationMs = getActiveConversationMs(
    room.activeConversation,
  );

  return {
    totalActiveConversationMs,
    billableMsByParticipant: Object.fromEntries(room.participantBillableMs),
    sessionStartedAt: room.sessionStartedAt,
    activeConversationMs: totalActiveConversationMs,
  };
}

function recordParticipantTurnUsage(
  room: RoomState,
  participantId: string,
  turnActiveMs: number,
): void {
  const currentBillable = room.participantBillableMs.get(participantId) ?? 0;
  room.participantBillableMs.set(participantId, currentBillable + turnActiveMs);
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

  if (
    room.turnParticipantId &&
    !room.participantIds.has(room.turnParticipantId)
  ) {
    room.turnParticipantId = null;
    room.phase = "waiting";
  }
}

function openTurnFloor(io: Server, roomCode: string, room: RoomState): void {
  room.turnParticipantId = null;
  room.phase = "waiting";
  emitTurnState(io, roomCode, room);
}

function emitUsageUpdate(io: Server, roomCode: string, room: RoomState): void {
  io.to(roomCode).emit("usage_update", {
    roomCode,
    ...buildUsagePayload(room),
  });
}

export function registerSocketHandlers(
  io: Server,
  rateLimits: SocketRateLimits,
): void {
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

      const participants = room.participantIds.size;
      ensureSessionStarted(room);

      // Never pre-assign: when both are present, floor stays open until
      // someone presses hold-to-talk (claim_turn).
      if (participants >= 2 && room.phase !== "processing") {
        room.turnParticipantId = null;
        room.phase = "waiting";
      }

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
        ...buildUsagePayload(room),
      });

      socket.to(code).emit("participant_joined", {
        participantId: socket.id,
        participants,
        myLang,
        turnState,
        ...buildUsagePayload(room),
      });

      if (participants >= 2 && room.phase === "waiting") {
        emitTurnState(io, code, room);
      }

      console.log(
        `socket ${socket.id} joined room ${code} (${participants} participants, lang=${myLang}, turn=${room.turnParticipantId})`,
      );
    });

    socket.on("claim_turn", (payload, callback) => {
      const code = socket.data.roomCode as string | undefined;

      if (!code) {
        callback?.({ ok: false, message: "Join a room first" });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        callback?.({ ok: false, message: "Room not found" });
        return;
      }

      if (room.participantIds.size < 2) {
        callback?.({ ok: false, message: "Waiting for partner" });
        return;
      }

      if (room.phase === "processing") {
        callback?.({ ok: false, message: "Translation in progress" });
        return;
      }

      if (
        room.phase === "speaking" &&
        room.turnParticipantId &&
        room.turnParticipantId !== socket.id
      ) {
        callback?.({ ok: false, message: "Partner is speaking" });
        return;
      }

      if (
        room.phase === "speaking" &&
        room.turnParticipantId === socket.id
      ) {
        callback?.({ ok: true });
        return;
      }

      room.turnParticipantId = socket.id;
      room.phase = "speaking";
      emitTurnState(io, code, room);
      callback?.({ ok: true });
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

      const rateLimitMessage = rejectIfAudioLimited(socket.id, rateLimits);
      if (rateLimitMessage) {
        socket.emit("error", { message: rateLimitMessage });
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

      const speechMs = Math.max(
        0,
        Math.round(payload.recordingDurationMs ?? 0),
      );
      const pipelineStartMs = resolvePipelineStartMs(
        payload.recordingStartedAt,
        speechMs,
      );

      startActivePipeline(room.activeConversation, socket.id, pipelineStartMs);
      emitTurnState(io, code, room);
      emitUsageUpdate(io, code, room);

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

        const turnActiveMs = speechMs + result.latencyMs;
        closeActivePipeline(room.activeConversation, socket.id);
        recordParticipantTurnUsage(room, socket.id, turnActiveMs);
        const usage = buildUsagePayload(room);

        const translationBase = {
          roomCode: code,
          fromParticipantId: socket.id,
          sourceLang: result.sourceLang,
          targetLang: result.targetLang,
          sourceText: result.sourceText,
          translatedText: result.translatedText,
          audioBase64: result.audio.toString("base64"),
          audioFormat: result.audioFormat,
          latencyMs: result.latencyMs,
          turnActiveMs,
          ...usage,
        };

        emitUsageUpdate(io, code, room);

        socket.to(code).emit("translation_result", translationBase);
        socket.emit("translation_sent", {
          ...translationBase,
          myBillableMs: room.participantBillableMs.get(socket.id) ?? 0,
        });
        openTurnFloor(io, code, room);
      } catch (error) {
        console.error(`audio_chunk error for ${socket.id}:`, error);

        closeActivePipeline(room.activeConversation, socket.id);
        emitUsageUpdate(io, code, room);

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
        closeActivePipeline(room.activeConversation, socket.id);
        room.participantIds.delete(socket.id);

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
            clearSessionIfAlone(room);
          }

          socket.to(code).emit("participant_left", {
            participantId: socket.id,
            participants: room.participantIds.size,
            turnState: getRoomTurnState(room),
            ...buildUsagePayload(room),
          });

          emitTurnState(io, code, room);
        }
      }

      console.log(`client disconnected: ${socket.id}`);
    });
  });
}
