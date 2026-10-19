import type { Server, Socket } from "socket.io";

import { runTranslationFromTranscript } from "../pipeline/fromTranscript.js";
import { resolveTargetLanguage } from "../pipeline/languageDetection.js";
import { shouldTranslatePartial } from "./partialTranslationThrottle.js";
import { createPartialTranslationScheduler } from "./partialTranslationScheduler.js";
import type { RealtimeTranscriptionSession } from "./realtimeTranscriptionSession.js";
import { synthesize } from "../pipeline/tts.js";

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
  lastPartialTranslatedText: string;
  lastSpokenTranslatedText: string;
  lastTranslateAtMs: number;
  translateInFlight: boolean;
  streamingFailed: boolean;
  sourceLangHint?: string;
  pendingPcmChunks: string[];
  sessionReady: boolean;
  partialTranslateScheduler: ReturnType<typeof createPartialTranslationScheduler>;
  resolveListenerTargetLang: () => Promise<string>;
};

export async function startStreamingTurn(
  session: RealtimeTranscriptionSession,
  turn: ActiveStreamingTurn,
): Promise<void> {
  await session.ready;
  turn.sessionReady = true;
  for (const chunk of turn.pendingPcmChunks) {
    session.appendPcm16Base64(chunk);
  }
  turn.pendingPcmChunks.length = 0;
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

function emitPartialTranslationAudio(
  ctx: StreamingPttTurnContext,
  targetLang: string,
  translatedText: string,
  audioBase64: string,
  audioFormat: string,
): void {
  const payload = {
    roomCode: ctx.roomCode,
    turnId: ctx.turnId,
    fromParticipantId: ctx.socket.id,
    translatedText,
    targetLang,
    audioBase64,
    audioFormat,
    isPartial: true,
    routing: "push_to_talk" as const,
  };
  ctx.socket.to(ctx.roomCode).emit("partial_translation_audio", payload);
  ctx.socket.emit("partial_translation_audio", {
    ...payload,
    role: "speaker" as const,
  });
}

export function createActiveStreamingTurn(input: {
  turnId: string;
  session: RealtimeTranscriptionSession;
  sourceLangHint?: string;
  resolveListenerTargetLang: () => Promise<string>;
  runPartialTranslate: () => Promise<void>;
}): ActiveStreamingTurn {
  return {
    turnId: input.turnId,
    session: input.session,
    accumulatedSource: "",
    lastTranslatedSource: "",
    lastPartialTranslatedText: "",
    lastSpokenTranslatedText: "",
    lastTranslateAtMs: 0,
    translateInFlight: false,
    streamingFailed: false,
    sourceLangHint: input.sourceLangHint,
    pendingPcmChunks: [],
    sessionReady: false,
    resolveListenerTargetLang: input.resolveListenerTargetLang,
    partialTranslateScheduler: createPartialTranslationScheduler({
      debounceMs: 400,
      run: input.runPartialTranslate,
    }),
  };
}

export function disposeActiveStreamingTurn(turn: ActiveStreamingTurn): void {
  turn.partialTranslateScheduler.cancel();
}

async function runPartialTranslateOnce(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  listenerTargetLang: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const nowMs = Date.now();
  if (
    !options.force &&
    !shouldTranslatePartial({
      sourceText: turn.accumulatedSource,
      lastTranslatedSource: turn.lastTranslatedSource,
      lastTranslateAtMs: turn.lastTranslateAtMs,
      nowMs,
    })
  ) {
    return;
  }

  if (turn.translateInFlight) {
    return;
  }

  turn.translateInFlight = true;
  turn.lastTranslateAtMs = nowMs;
  const sourceSnapshot = turn.accumulatedSource.trim();
  if (sourceSnapshot.length < 1) {
    turn.translateInFlight = false;
    return;
  }

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
    turn.lastPartialTranslatedText = translatedText;
    emitPartialTranslation(
      ctx,
      sourceSnapshot,
      translatedText,
      listenerTargetLang,
    );
    await maybeEarlyTtsForTranslation(turn, ctx, listenerTargetLang, translatedText);
  } catch (error) {
    console.warn("partial translation failed:", error);
  } finally {
    turn.translateInFlight = false;
  }
}

export async function maybeTranslatePartial(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  listenerTargetLang: string,
): Promise<void> {
  await runPartialTranslateOnce(turn, ctx, listenerTargetLang);
}

export function onStreamingSourceUpdated(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  accumulated: string,
): void {
  turn.accumulatedSource = accumulated;
  emitPartialTranscript(ctx, accumulated);
  turn.partialTranslateScheduler.bump();
}

export async function onStreamingPhraseCompleted(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  accumulated: string,
): Promise<void> {
  turn.accumulatedSource = accumulated;
  emitPartialTranscript(ctx, accumulated);
  const listenerTargetLang = await turn.resolveListenerTargetLang();
  await turn.partialTranslateScheduler.flush();
  await runPartialTranslateOnce(turn, ctx, listenerTargetLang, { force: true });
}

async function maybeEarlyTtsForTranslation(
  turn: ActiveStreamingTurn,
  ctx: StreamingPttTurnContext,
  listenerTargetLang: string,
  fullTranslatedText: string,
): Promise<void> {
  const socketsInRoom = await ctx.io.in(ctx.roomCode).fetchSockets();
  const listener = socketsInRoom.find((s) => s.id !== ctx.socket.id);
  if (listener != null && listener.data.playTranslatedVoice === false) {
    return;
  }

  const spokenPrefix = turn.lastSpokenTranslatedText;
  let delta = fullTranslatedText;
  if (spokenPrefix && fullTranslatedText.startsWith(spokenPrefix)) {
    delta = fullTranslatedText.slice(spokenPrefix.length).trim();
  } else if (spokenPrefix) {
    delta = fullTranslatedText;
  }

  if (!delta.trim()) {
    return;
  }

  const speakerVoiceId = ctx.socket.data.elevenlabsVoiceId as string | undefined;
  try {
    const audio = await synthesize(delta, {
      voiceId: speakerVoiceId,
      targetLang: listenerTargetLang,
      preferFast: true,
    });
    if (audio.length === 0) {
      turn.lastSpokenTranslatedText = fullTranslatedText;
      return;
    }
    emitPartialTranslationAudio(
      ctx,
      listenerTargetLang,
      delta,
      audio.toString("base64"),
      "mp3",
    );
    turn.lastSpokenTranslatedText = fullTranslatedText;
  } catch (error) {
    console.warn("partial TTS failed:", error);
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
  turn.partialTranslateScheduler.cancel();
  disposeActiveStreamingTurn(turn);

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

  const hadEarlyTts = turn.lastSpokenTranslatedText.length > 0;

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
      skipTts: !listenerPlayVoice || hadEarlyTts,
      onTranscriptReady: emitTranscriptEvents,
    });

    let finalAudio = result.audio;
    let skippedTts = result.skippedTts ?? false;

    if (listenerPlayVoice && hadEarlyTts) {
      const spoken = turn.lastSpokenTranslatedText;
      let remainder = result.translatedText;
      if (spoken && result.translatedText.startsWith(spoken)) {
        remainder = result.translatedText.slice(spoken.length).trim();
      }
      if (!remainder) {
        finalAudio = Buffer.alloc(0);
        skippedTts = true;
      } else {
        finalAudio = await synthesize(remainder, {
          voiceId: speakerVoiceId,
          targetLang,
          preferFast: true,
        });
        skippedTts = finalAudio.length === 0;
      }
    }

    const usedClonedVoice =
      !skippedTts &&
      Boolean(speakerVoiceId?.trim()) &&
      finalAudio.length > 0;

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
      audioBase64: finalAudio.toString("base64"),
      audioFormat: result.audioFormat,
      latencyMs: result.latencyMs,
      transcriptLatencyMs: result.transcriptLatencyMs,
      skippedTts,
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
