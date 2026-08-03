import type { Server, Socket } from "socket.io";

import { runTranslationPipeline } from "../pipeline/index.js";
import { resolveTargetLanguage } from "../pipeline/languageDetection.js";
import {
  closeActivePipeline,
  createActiveConversationTracker,
  getActiveConversationMs,
  resolvePipelineStartMs,
  startActivePipeline,
  type ActiveConversationTracker,
} from "./activeConversation.js";
import { rejectIfAudioLimited, type SocketRateLimits } from "./rateLimit.js";
import {
  reconcileParticipantsFromLive,
  reconcileParticipantsOnJoin,
  removeParticipant,
} from "./roomParticipants.js";

type JoinRoomPayload = {
  roomCode: string;
  speakLang?: string;
  hearLang?: string;
  speakLangOverride?: string;
  speakerGender?: "female" | "male";
  elevenlabsVoiceId?: string;
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

function emitParticipantsSync(
  io: Server,
  roomCode: string,
  room: RoomState,
  participants: number,
): void {
  io.to(roomCode).emit("participants_sync", {
    roomCode,
    participants,
    ...buildUsagePayload(room),
  });
}

async function broadcastRoomParticipants(
  io: Server,
  roomCode: string,
  room: RoomState,
): Promise<number> {
  const socketsInRoom = await io.in(roomCode).fetchSockets();
  const participants = reconcileParticipantsFromLive(room, socketsInRoom);

  if (
    room.turnParticipantId &&
    !room.participantIds.has(room.turnParticipantId)
  ) {
    room.turnParticipantId = null;
    room.phase = "waiting";
  }

  return participants;
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
      const {
        roomCode,
        speakLang,
        hearLang,
        speakLangOverride,
        speakerGender,
        elevenlabsVoiceId,
      } = payload;

      if (!roomCode?.trim()) {
        socket.emit("error", { message: "roomCode is required" });
        return;
      }

      const code = roomCode.trim().toUpperCase();
      const translateToLang = resolveTargetLanguage(
        hearLang ?? speakLang ?? "en",
      );
      const resolvedSpeakOverride = speakLangOverride
        ? resolveTargetLanguage(speakLangOverride)
        : undefined;

      socket.join(code);

      if (!rooms.has(code)) {
        rooms.set(code, createRoomState());
      }

      const room = rooms.get(code)!;
      const socketsInRoom = await io.in(code).fetchSockets();

      const participants = reconcileParticipantsOnJoin(
        room,
        socketsInRoom,
        socket.id,
      );

      socket.data.roomCode = code;
      socket.data.hearLang = translateToLang;
      if (resolvedSpeakOverride) {
        socket.data.speakLangOverride = resolvedSpeakOverride;
      } else {
        delete socket.data.speakLangOverride;
      }
      if (speakerGender === "female" || speakerGender === "male") {
        socket.data.speakerGender = speakerGender;
      }
      if (elevenlabsVoiceId?.trim()) {
        socket.data.elevenlabsVoiceId = elevenlabsVoiceId.trim();
      } else {
        delete socket.data.elevenlabsVoiceId;
      }

      ensureSessionStarted(room);

      // Never pre-assign: when both are present, floor stays open until
      // someone presses hold-to-talk (claim_turn).
      if (participants >= 2 && room.phase !== "processing") {
        room.turnParticipantId = null;
        room.phase = "waiting";
      }

      const partnerSocket = socketsInRoom.find((s) => s.id !== socket.id);
      const partnerTranslateTo = partnerSocket?.data.hearLang as
        | string
        | undefined;
      const turnState = getRoomTurnState(room);

      socket.emit("joined_room", {
        roomCode: code,
        participantId: socket.id,
        participants,
        myLang: translateToLang,
        partnerLang: partnerTranslateTo,
        turnState,
        ...buildUsagePayload(room),
      });

      socket.to(code).emit("participant_joined", {
        participantId: socket.id,
        participants,
        myLang: translateToLang,
        turnState,
        ...buildUsagePayload(room),
      });

      if (participants >= 2 && room.phase === "waiting") {
        emitTurnState(io, code, room);
      }

      console.log(
        `socket ${socket.id} joined room ${code} (${participants} participants, translateTo=${translateToLang}, turn=${room.turnParticipantId})`,
      );

      void (async () => {
        const syncedParticipants = await broadcastRoomParticipants(io, code, room);
        if (syncedParticipants !== participants) {
          ensureSessionStarted(room);
          emitParticipantsSync(io, code, room, syncedParticipants);
        }
      })();
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

    socket.on("release_turn", (_payload, callback) => {
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

      if (
        room.phase === "speaking" &&
        room.turnParticipantId === socket.id
      ) {
        openTurnFloor(io, code, room);
      }

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
        const socketsInRoom = await io.in(code).fetchSockets();
        const listener = socketsInRoom.find((s) => s.id !== socket.id);
        const targetLang = listener
          ? resolveTargetLanguage(listener.data.hearLang as string | undefined)
          : resolveTargetLanguage(payload.targetLang);

        const speakerGender = socket.data.speakerGender as
          | "female"
          | "male"
          | undefined;
        const addresseeGender = listener?.data.speakerGender as
          | "female"
          | "male"
          | undefined;

        const sourceLangOverride = socket.data.speakLangOverride as
          | string
          | undefined;

        const speakerVoiceId = socket.data.elevenlabsVoiceId as string | undefined;

        const result = await runTranslationPipeline({
          audio,
          targetLang,
          format: payload.format ?? "webm",
          sourceLangOverride,
          speakerGender,
          addresseeGender,
          voiceId: speakerVoiceId,
        });

        const usedClonedVoice =
          !result.skippedTts &&
          Boolean(speakerVoiceId?.trim()) &&
          result.audio.length > 0;

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
          skippedTts: result.skippedTts ?? false,
          usedClonedVoice,
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

        openTurnFloor(io, code, room);

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
        removeParticipant(room, socket.id);

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
