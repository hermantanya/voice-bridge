import type { Server, Socket } from "socket.io";

import {
  validateAudioBuffer,
  validateRecordingDurationMs,
} from "../pipeline/audioFormat.js";
import {
  runTranslationPipeline,
  type PipelineResult,
} from "../pipeline/index.js";
import {
  DEFAULT_CONVERSATION_MODE,
  parseConversationMode,
  type ConversationMode,
} from "./conversationMode.js";
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
import { isStreamingPttAllowedForClient } from "../streaming/streamingPttConfig.js";
import { streamingPttDebugLog } from "../streaming/streamingPttDebug.js";
import {
  getDefaultRealtimeSessionFactory,
  type RealtimeTranscriptionSessionFactory,
} from "../streaming/realtimeTranscriptionSession.js";
import {
  type ActiveStreamingTurn,
  createActiveStreamingTurn,
  disposeActiveStreamingTurn,
  finalizeStreamingTurn,
  maybeTranslatePartial,
  onStreamingPhraseCompleted,
  onStreamingSourceUpdated,
  startStreamingTurn,
  type StreamingPttTurnContext,
} from "../streaming/streamingPttTurn.js";

type JoinRoomPayload = {
  roomCode: string;
  speakLang?: string;
  hearLang?: string;
  speakLangOverride?: string;
  speakerGender?: "female" | "male";
  elevenlabsVoiceId?: string;
  conversationMode?: ConversationMode;
  /** When false, listener gets transcript only (no TTS). Default true. */
  playTranslatedVoice?: boolean;
  /** Client opt-in when EXPO_PUBLIC_STREAMING_PTT or dev toggle (server also gates). */
  streamingPtt?: boolean;
};

export type TranslationPipelineRunner = typeof runTranslationPipeline;

export type SocketHandlerDeps = {
  runTranslationPipeline: TranslationPipelineRunner;
  createRealtimeTranscriptionSession?: RealtimeTranscriptionSessionFactory;
};

export function createDefaultSocketHandlerDeps(): SocketHandlerDeps {
  return {
    runTranslationPipeline,
    createRealtimeTranscriptionSession: getDefaultRealtimeSessionFactory(),
  };
}

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
const activeStreamingTurns = new Map<string, ActiveStreamingTurn>();

/** Clears streaming turn state (integration tests only). */
export function resetStreamingTurnsForTests(): void {
  for (const turn of activeStreamingTurns.values()) {
    turn.session.close();
  }
  activeStreamingTurns.clear();
}

/** Clears in-memory room state (integration tests only). */
export function resetRoomsForTests(): void {
  resetStreamingTurnsForTests();
  rooms.clear();
}

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

type SpeechRouting = "push_to_talk" | "hands_free";

export async function processSpeechPayload(
  io: Server,
  socket: Socket,
  room: RoomState,
  code: string,
  payload: AudioChunkPayload,
  routing: SpeechRouting,
  runPipeline: TranslationPipelineRunner,
): Promise<void> {
  if (routing === "push_to_talk") {
    if (room.phase !== "speaking" || room.turnParticipantId !== socket.id) {
      socket.emit("error", { message: "Not your turn" });
      return;
    }
  }

  const speechMs = Math.max(
    0,
    Math.round(payload.recordingDurationMs ?? 0),
  );

  let audio: Buffer;
  try {
    audio = Buffer.from(payload.audioBase64, "base64");
  } catch {
    if (routing === "push_to_talk") {
      openTurnFloor(io, code, room);
    }
    socket.emit("error", {
      message: "Invalid audio data. Try recording again.",
    });
    return;
  }

  const audioValidationMessage = validateAudioBuffer(audio);
  const durationValidationMessage = validateRecordingDurationMs(speechMs);
  if (audioValidationMessage || durationValidationMessage) {
    if (routing === "push_to_talk") {
      openTurnFloor(io, code, room);
    }
    socket.emit("error", {
      message: audioValidationMessage ?? durationValidationMessage!,
    });
    return;
  }

  if (routing === "push_to_talk") {
    room.phase = "processing";
  }

  const pipelineStartMs = resolvePipelineStartMs(
    payload.recordingStartedAt,
    speechMs,
  );

  startActivePipeline(room.activeConversation, socket.id, pipelineStartMs);
  if (routing === "push_to_talk") {
    emitTurnState(io, code, room);
  }
  emitUsageUpdate(io, code, room);

  try {
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

    const listenerPlayVoice =
      listener?.data.playTranslatedVoice !== false;
    const turnId = `${socket.id}-${Date.now()}`;

    const emitTranscriptEvents = (progress: {
      sourceLang: string;
      targetLang: string;
      sourceText: string;
      translatedText: string;
      transcriptLatencyMs: number;
      skippedTts: boolean;
    }) => {
      const transcriptBase = {
        roomCode: code,
        turnId,
        fromParticipantId: socket.id,
        sourceLang: progress.sourceLang,
        targetLang: progress.targetLang,
        sourceText: progress.sourceText,
        translatedText: progress.translatedText,
        transcriptLatencyMs: progress.transcriptLatencyMs,
        skippedTts: progress.skippedTts,
        routing,
      };

      socket.to(code).emit("translation_transcript", transcriptBase);
      socket.emit("translation_sent_transcript", {
        ...transcriptBase,
        myBillableMs: room.participantBillableMs.get(socket.id) ?? 0,
      });
    };

    const result: PipelineResult = await runPipeline({
      audio,
      targetLang,
      format: payload.format ?? "webm",
      sourceLangOverride,
      speakerGender,
      addresseeGender,
      voiceId: speakerVoiceId,
      skipTts: !listenerPlayVoice,
      onTranscriptReady: emitTranscriptEvents,
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
      turnId,
      fromParticipantId: socket.id,
      sourceLang: result.sourceLang,
      targetLang: result.targetLang,
      sourceText: result.sourceText,
      translatedText: result.translatedText,
      audioBase64: result.audio.toString("base64"),
      audioFormat: result.audioFormat,
      latencyMs: result.latencyMs,
      transcriptLatencyMs: result.transcriptLatencyMs,
      skippedTts: result.skippedTts ?? false,
      usedClonedVoice,
      turnActiveMs,
      routing,
      ...usage,
    };

    emitUsageUpdate(io, code, room);

    socket.to(code).emit("translation_result", translationBase);
    socket.emit("translation_sent", {
      ...translationBase,
      myBillableMs: room.participantBillableMs.get(socket.id) ?? 0,
    });

    if (routing === "push_to_talk") {
      openTurnFloor(io, code, room);
    }
  } catch (error) {
    console.error(`speech payload error for ${socket.id}:`, error);

    closeActivePipeline(room.activeConversation, socket.id);
    emitUsageUpdate(io, code, room);

    if (routing === "push_to_talk") {
      openTurnFloor(io, code, room);
    }

    socket.emit("error", {
      message: error instanceof Error ? error.message : "Translation failed",
    });
  }
}

function getSocketConversationMode(socket: Socket): ConversationMode {
  const mode = socket.data.conversationMode as ConversationMode | undefined;
  return mode ?? DEFAULT_CONVERSATION_MODE;
}

export function registerSocketHandlers(
  io: Server,
  rateLimits: SocketRateLimits,
  deps: SocketHandlerDeps = createDefaultSocketHandlerDeps(),
): void {
  const { runTranslationPipeline: runPipeline } = deps;
  const createRealtimeSession =
    deps.createRealtimeTranscriptionSession ??
    getDefaultRealtimeSessionFactory();

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
        conversationMode: conversationModeRaw,
        playTranslatedVoice,
        streamingPtt,
      } = payload;

      if (!roomCode?.trim()) {
        socket.emit("error", { message: "roomCode is required" });
        return;
      }

      const conversationMode = parseConversationMode(conversationModeRaw);
      if (!conversationMode) {
        socket.emit("error", {
          message: "conversationMode must be push_to_talk or hands_free",
        });
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
      socket.data.conversationMode = conversationMode;
      if (playTranslatedVoice === false) {
        socket.data.playTranslatedVoice = false;
      } else {
        delete socket.data.playTranslatedVoice;
      }
      if (isStreamingPttAllowedForClient(streamingPtt === true)) {
        socket.data.streamingPtt = true;
        streamingPttDebugLog("join_room streaming PTT enabled", {
          socketId: socket.id,
          roomCode: code,
        });
      } else {
        delete socket.data.streamingPtt;
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
        conversationMode,
        turnState,
        streamingPttEnabled: socket.data.streamingPtt === true,
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

    async function handleSpeechEvent(
      payload: AudioChunkPayload,
      routing: SpeechRouting,
    ): Promise<void> {
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

      await processSpeechPayload(
        io,
        socket,
        room,
        code,
        payload,
        routing,
        runPipeline,
      );
    }

    socket.on("audio_chunk", (payload: AudioChunkPayload) => {
      void handleSpeechEvent(payload, "push_to_talk");
    });

    function buildStreamingTurnContext(
      code: string,
      room: RoomState,
      turnId: string,
      speechMs: number,
      recordingStartedAt?: number,
    ): StreamingPttTurnContext {
      return {
        io,
        socket,
        roomCode: code,
        turnId,
        speechMs,
        recordingStartedAt,
        runBatchFallback: async (fallbackPayload) => {
          room.turnParticipantId = socket.id;
          room.phase = "speaking";
          await processSpeechPayload(
            io,
            socket,
            room,
            code,
            fallbackPayload,
            "push_to_talk",
            runPipeline,
          );
        },
        openTurnFloor: () => openTurnFloor(io, code, room),
        setProcessingPhase: () => {
          room.phase = "processing";
          emitTurnState(io, code, room);
        },
        emitUsageUpdate: () => emitUsageUpdate(io, code, room),
        startActivePipeline: (pipelineStartMs) => {
          startActivePipeline(room.activeConversation, socket.id, pipelineStartMs);
        },
        closeActivePipeline: () => {
          closeActivePipeline(room.activeConversation, socket.id);
        },
        recordTurnUsage: (turnActiveMs) => {
          recordParticipantTurnUsage(room, socket.id, turnActiveMs);
        },
        buildUsagePayload: () => buildUsagePayload(room),
      };
    }

    socket.on("streaming_ptt_start", async (_payload, callback) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code || !socket.data.streamingPtt) {
        callback?.({ ok: false, message: "Streaming PTT not enabled" });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        callback?.({ ok: false, message: "Room not found" });
        return;
      }

      if (room.phase !== "speaking" || room.turnParticipantId !== socket.id) {
        callback?.({ ok: false, message: "Not your turn" });
        return;
      }

      const apiKey = process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        callback?.({ ok: false, message: "Streaming PTT unavailable" });
        return;
      }

      const existing = activeStreamingTurns.get(socket.id);
      if (existing) {
        disposeActiveStreamingTurn(existing);
        existing.session.close();
      }

      const turnId = `${socket.id}-${Date.now()}`;
      const sourceLangHint = socket.data.speakLangOverride as string | undefined;

      const resolveListenerTargetLang = async () => {
        const socketsInRoom = await io.in(code).fetchSockets();
        const listener = socketsInRoom.find((s) => s.id !== socket.id);
        return resolveTargetLanguage(listener?.data.hearLang as string | undefined);
      };

      let activeTurn!: ActiveStreamingTurn;

      const session = createRealtimeSession(
        apiKey,
        {
          onDelta: (_delta, accumulated) => {
            const turn = activeStreamingTurns.get(socket.id);
            if (!turn || turn.turnId !== turnId) {
              return;
            }
            onStreamingSourceUpdated(
              turn,
              buildStreamingTurnContext(code, room, turnId, 0),
              accumulated,
            );
          },
          onPhraseCompleted: (_phrase, accumulated) => {
            const turn = activeStreamingTurns.get(socket.id);
            if (!turn || turn.turnId !== turnId) {
              return;
            }
            void onStreamingPhraseCompleted(
              turn,
              buildStreamingTurnContext(code, room, turnId, 0),
              accumulated,
            );
          },
          onError: (message) => {
            console.warn(`streaming ASR for ${socket.id}: ${message}`);
            const turn = activeStreamingTurns.get(socket.id);
            if (turn) {
              turn.streamingFailed = true;
            }
            socket.emit("error", {
              message: `Live transcription unavailable (${message}). Translation will finish when you release.`,
            });
          },
        },
        sourceLangHint,
      );

      activeTurn = createActiveStreamingTurn({
        turnId,
        session,
        sourceLangHint,
        resolveListenerTargetLang,
        runPartialTranslate: async () => {
          const turn = activeStreamingTurns.get(socket.id);
          if (!turn || turn.turnId !== turnId) {
            return;
          }
          const targetLang = await turn.resolveListenerTargetLang();
          await maybeTranslatePartial(
            turn,
            buildStreamingTurnContext(code, room, turnId, 0),
            targetLang,
          );
        },
      });
      activeStreamingTurns.set(socket.id, activeTurn);

      try {
        await startStreamingTurn(session, activeTurn);
        streamingPttDebugLog("streaming_ptt_start ok", {
          socketId: socket.id,
          turnId,
          roomCode: code,
        });
        callback?.({ ok: true, turnId });
      } catch (error) {
        activeStreamingTurns.delete(socket.id);
        session.close();
        streamingPttDebugLog("streaming_ptt_start failed", {
          socketId: socket.id,
          message: error instanceof Error ? error.message : String(error),
        });
        callback?.({
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Could not start streaming session",
        });
      }
    });

    socket.on("streaming_audio_chunk", (payload: { audioBase64?: string; format?: string }) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code || !socket.data.streamingPtt) {
        return;
      }

      const turn = activeStreamingTurns.get(socket.id);
      if (!turn || !payload?.audioBase64) {
        return;
      }

      const rateLimitMessage = rejectIfAudioLimited(socket.id, rateLimits);
      if (rateLimitMessage) {
        socket.emit("error", { message: rateLimitMessage });
        return;
      }

      const format = payload.format ?? "pcm16";
      if (format === "pcm16") {
        if (!turn.sessionReady) {
          turn.pendingPcmChunks.push(payload.audioBase64);
          streamingPttDebugLog("streaming_audio_chunk queued (session not ready)", {
            socketId: socket.id,
            pending: turn.pendingPcmChunks.length,
          });
        } else {
          turn.session.appendPcm16Base64(payload.audioBase64);
        }
      }
    });

    socket.on("streaming_ptt_stop", async (payload: AudioChunkPayload, callback) => {
      const code = socket.data.roomCode as string | undefined;
      if (!code || !socket.data.streamingPtt) {
        callback?.({ ok: false, message: "Streaming PTT not enabled" });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        callback?.({ ok: false, message: "Room not found" });
        return;
      }

      if (room.phase !== "speaking" || room.turnParticipantId !== socket.id) {
        callback?.({ ok: false, message: "Not your turn" });
        return;
      }

      const turn = activeStreamingTurns.get(socket.id);
      if (!turn) {
        callback?.({ ok: false, message: "No active streaming session" });
        return;
      }

      activeStreamingTurns.delete(socket.id);

      const speechMs = Math.max(0, Math.round(payload.recordingDurationMs ?? 0));
      const ctx = buildStreamingTurnContext(
        code,
        room,
        turn.turnId,
        speechMs,
        payload.recordingStartedAt,
      );

      try {
        await finalizeStreamingTurn(turn, ctx, {
          audioBase64: payload.audioBase64,
          format: payload.format,
          recordingDurationMs: payload.recordingDurationMs,
        });
        callback?.({ ok: true });
      } catch (error) {
        openTurnFloor(io, code, room);
        callback?.({
          ok: false,
          message:
            error instanceof Error ? error.message : "Streaming stop failed",
        });
      }
    });

    socket.on("utterance", (payload: AudioChunkPayload) => {
      if (getSocketConversationMode(socket) !== "hands_free") {
        socket.emit("error", {
          message: "Utterances require hands-free conversation mode",
        });
        return;
      }

      void handleSpeechEvent(payload, "hands_free");
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode as string | undefined;
      const streamingTurn = activeStreamingTurns.get(socket.id);
      if (streamingTurn) {
        disposeActiveStreamingTurn(streamingTurn);
        streamingTurn.session.close();
      }
      activeStreamingTurns.delete(socket.id);

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
