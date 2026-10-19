import type { Server, Socket } from "socket.io";

import { runTranslationFromTranscript } from "../pipeline/fromTranscript.js";
import { resolveTargetLanguage } from "../pipeline/languageDetection.js";
import { shouldTranslatePartial } from "./partialTranslationThrottle.js";
import type { RealtimeTranscriptionSession } from "./realtimeTranscriptionSession.js";

export type StreamingPttTurnContext = {
  io: Server;
  socket: Socket;
  roomCode: string;
  turnId: string;
  speechMs: number;
  recordingStartedAt?: number;
  runBatchFallback: (payload: {
    audioBase64: string;
    format?: string;
    recordingDurationMs?: number;
    recordingStartedAt?: number;
  }) => Promise<void>;
  openTurnFloor: () => void;
  setProcessingPhase?: () => void;
  emitUsageUpdate: () => void;
  startActivePipeline: (pipelineStartMs: number) => void;
  closeActivePipeline: () => void;
  recordTurnUsage: (turnActiveMs: number) => void;
  buildUsagePayload: () => Record<string, unknown>;
};

export type ActiveStreamingTurn = {
  turnId: string;
  session: RealtimeTranscriptionSession;
  accumulatedSource: string;
  lastTranslatedSource: string;
  lastTranslateAtMs: number;
  translateInFlight: boolean;
  streamingFailed: boolean;
  sourceLangHint?: string;
};

export async function startStreamingTurn(
  session: RealtimeTranscriptionSession,
): Promise<void> {
  await session.ready;
}

export function emitPartialTranscript(
  ctx: StreamingPttTurnContext,
  sourceText: string,
): void {
  const payload = {
    roomCode: ctx.roomCode,
    turnId: ctx.turnId,
    fromParticipantId: ctx.socket.id,
    sourceText,
    isPartial: true,
    routing: "push_to_talk" as const,
  };
  ctx.socket.to(ctx.roomCode).emit("partial_transcript", payload);
  ctx.socket.emit("partial_transcript", {
    ...payload,
    role: "speaker" as const,
  });
}

export function emitPartialTranslation(
  ctx: StreamingPttTurnContext,
  sourceText: string,
  translatedText: string,
  targetLang: string,
): void {
  const payload = {
    roomCode: ctx.roomCode,
    turnId: ctx.turnId,
    fromParticipantId: ctx.socket.id,
    sourceText,
    translatedText,
    targetLang,
    isPartial: true,
    routing: "push_to_talk" as const,
  };
  ctx.socket.to(ctx.roomCode).emit("partial_translation", payload);
  ctx.socket.emit("partial_translation", {
    ...payload,
    role: "speaker" as const,
  });
}

export async function maybeTranslatePartial(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  listenerTargetLang: string,
): Promise<void> {
  const nowMs = Date.now();
  if (
    !shouldTranslatePartial({
      sourceText: turn.accumulatedSource,
      lastTranslatedSource: turn.lastTranslatedSource,
      lastTranslateAtMs: turn.lastTranslateAtMs,
      nowMs,
    }) ||
    turn.translateInFlight
  ) {
    return;
  }

  turn.translateInFlight = true;
  turn.lastTranslateAtMs = nowMs;
  const sourceSnapshot = turn.accumulatedSource.trim();

  try {
    const { translate } = await import("../pipeline/translate.js");
    const sourceLang = turn.sourceLangHint ?? "en";
    const translatedText = await translate(
      sourceSnapshot,
      sourceLang,
      listenerTargetLang,
      ctx.socket.data.speakerGender as "female" | "male" | undefined,
      undefined,
    );
    turn.lastTranslatedSource = sourceSnapshot;
    emitPartialTranslation(
      ctx,
      sourceSnapshot,
      translatedText,
      listenerTargetLang,
    );
  } catch (error) {
    console.warn("partial translation failed:", error);
  } finally {
    turn.translateInFlight = false;
  }
}

export async function finalizeStreamingTurn(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  fallback: {
    audioBase64?: string;
    format?: string;
    recordingDurationMs?: number;
  },
): Promise<void> {
  let finalSourceText = "";
  try {
    finalSourceText = (await turn.session.finalize()).trim();
  } catch (error) {
    console.warn("streaming finalize failed:", error);
    turn.streamingFailed = true;
  } finally {
    turn.session.close();
  }

  const speechMs = Math.max(0, Math.round(ctx.speechMs));

  if (!finalSourceText && fallback.audioBase64) {
    await runBatchFallback(ctx, fallback, speechMs);
    return;
  }

  if (!finalSourceText) {
    ctx.openTurnFloor();
    ctx.socket.emit("error", {
      message: "No speech detected. Try holding the button a little longer.",
    });
    return;
  }

  await runFinalizeFromText(ctx, turn, finalSourceText, speechMs);
}

async function runBatchFallback(
  ctx: StreamingPttTurnContext,
  fallback: {
    audioBase64?: string;
    format?: string;
    recordingDurationMs?: number;
  },
  speechMs: number,
): Promise<void> {
  if (!fallback.audioBase64) {
    ctx.openTurnFloor();
    ctx.socket.emit("error", { message: "Streaming failed and no audio fallback." });
    return;
  }

  await ctx.runBatchFallback({
    audioBase64: fallback.audioBase64,
    format: fallback.format ?? "webm",
    recordingDurationMs: fallback.recordingDurationMs ?? speechMs,
    recordingStartedAt: ctx.recordingStartedAt,
  });
}

async function runFinalizeFromText(
  ctx: StreamingPttTurnContext,
  turn: ActiveStreamingTurn,
  finalSourceText: string,
  speechMs: number,
): Promise<void> {
  const startedAt = Date.now();
  ctx.setProcessingPhase?.();
  ctx.startActivePipeline(
    ctx.recordingStartedAt ?? Math.max(0, startedAt - speechMs),
  );
  ctx.emitUsageUpdate();

  const socketsInRoom = await ctx.io.in(ctx.roomCode).fetchSockets();
  const listener = socketsInRoom.find((s) => s.id !== ctx.socket.id);
  const targetLang = listener
    ? resolveTargetLanguage(listener.data.hearLang as string | undefined)
    : resolveTargetLanguage(undefined);
  const sourceLang = turn.sourceLangHint ?? "en";
  const listenerPlayVoice =
    listener != null && listener.data.playTranslatedVoice !== false;
  const speakerVoiceId = ctx.socket.data.elevenlabsVoiceId as
    | string
    | undefined;

  const emitTranscriptEvents = (progress: {
    sourceLang: string;
    targetLang: string;
    sourceText: string;
    translatedText: string;
    transcriptLatencyMs: number;
    skippedTts: boolean;
  }) => {
    const transcriptBase = {
      roomCode: ctx.roomCode,
      turnId: ctx.turnId,
      fromParticipantId: ctx.socket.id,
      sourceLang: progress.sourceLang,
      targetLang: progress.targetLang,
      sourceText: progress.sourceText,
      translatedText: progress.translatedText,
      transcriptLatencyMs: progress.transcriptLatencyMs,
      skippedTts: progress.skippedTts,
      routing: "push_to_talk" as const,
    };

    ctx.socket.to(ctx.roomCode).emit("translation_transcript", transcriptBase);
    ctx.socket.emit("translation_sent_transcript", transcriptBase);
  };

  try {
    const result = await runTranslationFromTranscript({
      sourceText: finalSourceText,
      sourceLang,
      targetLang,
      speakerGender: ctx.socket.data.speakerGender as "female" | "male" | undefined,
      addresseeGender: listener?.data.speakerGender as
        | "female"
        | "male"
        | undefined,
      voiceId: speakerVoiceId,
      skipTts: !listenerPlayVoice,
      onTranscriptReady: emitTranscriptEvents,
    });

    const usedClonedVoice =
      !result.skippedTts &&
      Boolean(speakerVoiceId?.trim()) &&
      result.audio.length > 0;

    const turnActiveMs = speechMs + result.latencyMs;
    ctx.closeActivePipeline();
    ctx.recordTurnUsage(turnActiveMs);
    const usage = ctx.buildUsagePayload();

    const translationBase = {
      roomCode: ctx.roomCode,
      turnId: ctx.turnId,
      fromParticipantId: ctx.socket.id,
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
      routing: "push_to_talk" as const,
      ...usage,
    };

    ctx.emitUsageUpdate();
    ctx.socket.to(ctx.roomCode).emit("translation_result", translationBase);
    ctx.socket.emit("translation_sent", translationBase);
    ctx.openTurnFloor();
  } catch (error) {
    console.error("finalize streaming turn error:", error);
    ctx.closeActivePipeline();
    ctx.emitUsageUpdate();
    ctx.openTurnFloor();
    ctx.socket.emit("error", {
      message: error instanceof Error ? error.message : "Translation failed",
    });
  }
}
