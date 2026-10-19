import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import test from "node:test";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { Server } from "socket.io";

import type { PipelineInput, PipelineResult } from "../pipeline/index.js";
import {
  buildSessionUpdate,
  createMockRealtimeTranscriptionSession,
} from "../streaming/realtimeTranscriptionSession.js";
import {
  createDefaultSocketHandlerDeps,
  registerSocketHandlers,
  resetRoomsForTests,
  type TranslationPipelineRunner,
} from "./handler.js";
import { createSocketRateLimits } from "./rateLimit.js";

const EVENT_TIMEOUT_MS = process.env.CI === "true" ? 20_000 : 10_000;

function waitForEvent<T>(
  socket: ClientSocket,
  event: string,
  timeoutMs = EVENT_TIMEOUT_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    const handler = (payload: T) => {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };

    socket.on(event, handler);
  });
}

function buildWavWithPcm(pcmBytes: number): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcmBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcmBytes, 40);
  const pcm = Buffer.alloc(pcmBytes, 0xcd);
  return Buffer.concat([header, pcm]);
}

const VALID_TEST_AUDIO = buildWavWithPcm(1600);

test("realtime transcription mock uses GA session.update shape", () => {
  const payload = buildSessionUpdate("en") as {
    type?: string;
    session?: {
      type?: string;
      audio?: {
        input?: {
          format?: { type?: string; rate?: number };
          transcription?: { model?: string; language?: string };
          turn_detection?: { type?: string };
        };
      };
    };
  };

  assert.equal(payload.type, "session.update");
  assert.equal(payload.session?.type, "transcription");
  assert.equal(payload.session?.audio?.input?.format?.type, "audio/pcm");
  assert.equal(payload.session?.audio?.input?.format?.rate, 24_000);
  assert.equal(payload.session?.audio?.input?.turn_detection?.type, "server_vad");
  assert.equal(payload.session?.audio?.input?.transcription?.model, "gpt-4o-transcribe");
  assert.equal(payload.session?.audio?.input?.transcription?.language, "en");
});

function createMockPipeline(): TranslationPipelineRunner {
  return async (input: PipelineInput): Promise<PipelineResult> => {
    await input.onTranscriptReady?.({
      sourceLang: "en",
      targetLang: "he",
      sourceText: "batch fallback",
      translatedText: "batch he",
      transcriptLatencyMs: 5,
      skippedTts: true,
      timing: { sttMs: 2, translateMs: 3, ttsMs: 0 },
    });

    return {
      sourceLang: "en",
      targetLang: "he",
      sourceText: "batch fallback",
      translatedText: "batch he",
      audio: Buffer.alloc(0),
      audioFormat: "mp3",
      latencyMs: 5,
      transcriptLatencyMs: 5,
      skippedTts: true,
      timing: { sttMs: 2, translateMs: 3, ttsMs: 0 },
    };
  };
}

async function startTestServer(): Promise<{
  httpServer: HttpServer;
  url: string;
  close: () => Promise<void>;
}> {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: true },
  });

  registerSocketHandlers(io, createSocketRateLimits(), {
    ...createDefaultSocketHandlerDeps(),
    runTranslationPipeline: createMockPipeline(),
    createRealtimeTranscriptionSession: (_apiKey, handlers) =>
      createMockRealtimeTranscriptionSession(handlers),
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }

  return {
    httpServer,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        io.close();
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

function connectClient(url: string): ClientSocket {
  return createClient(url, {
    transports: ["websocket"],
    forceNew: true,
  });
}

test("streaming PTT emits partials and finalizes without batch fallback", async (t) => {
  const prevFlag = process.env.STREAMING_PTT_ENABLED;
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.STREAMING_PTT_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.VOICE_BRIDGE_TEST_TRANSLATE = "1";
  resetRoomsForTests();

  t.after(async () => {
    process.env.STREAMING_PTT_ENABLED = prevFlag;
    process.env.OPENAI_API_KEY = prevKey;
    delete process.env.VOICE_BRIDGE_TEST_TRANSLATE;
    resetRoomsForTests();
  });

  const server = await startTestServer();
  t.after(() => server.close());

  const speaker = connectClient(server.url);
  const listener = connectClient(server.url);

  t.after(() => {
    speaker.disconnect();
    listener.disconnect();
  });

  await Promise.all([
    new Promise<void>((resolve) => speaker.once("connect", () => resolve())),
    new Promise<void>((resolve) => listener.once("connect", () => resolve())),
  ]);

  speaker.emit("join_room", {
    roomCode: "STREAM",
    hearLang: "en",
    speakerGender: "female",
    streamingPtt: true,
  });
  listener.emit("join_room", {
    roomCode: "STREAM",
    hearLang: "he",
    speakerGender: "male",
    streamingPtt: true,
    playTranslatedVoice: false,
  });

  await waitForEvent(speaker, "joined_room");
  await waitForEvent(listener, "joined_room");

  await new Promise<void>((resolve, reject) => {
    speaker.emit("claim_turn", {}, (response?: { ok?: boolean }) => {
      if (response?.ok) {
        resolve();
        return;
      }
      reject(new Error("claim_turn failed"));
    });
  });

  await new Promise<void>((resolve, reject) => {
    speaker.emit("streaming_ptt_start", {}, (response?: { ok?: boolean }) => {
      if (response?.ok) {
        resolve();
        return;
      }
      reject(new Error("streaming_ptt_start failed"));
    });
  });

  speaker.emit("streaming_audio_chunk", {
    audioBase64: Buffer.alloc(120, 1).toString("base64"),
    format: "pcm16",
  });

  const partial = await waitForEvent<{ sourceText?: string; isPartial?: boolean }>(
    listener,
    "partial_transcript",
  );
  assert.equal(partial.isPartial, true);
  assert.match(partial.sourceText ?? "", /hello/i);

  const partialTranslation = await waitForEvent<{ translatedText?: string; isPartial?: boolean }>(
    listener,
    "partial_translation",
  );
  assert.equal(partialTranslation.isPartial, true);
  assert.ok((partialTranslation.translatedText ?? "").length > 0);

  speaker.emit("streaming_ptt_stop", {
    audioBase64: "",
    format: "webm",
    recordingDurationMs: 1200,
  });

  const finalTranscript = await waitForEvent<{ sourceText?: string }>(
    listener,
    "translation_transcript",
  );
  assert.match(finalTranscript.sourceText ?? "", /hello/i);
});

test("streaming PTT batch fallback when mock finalize empty and audio provided", async (t) => {
  const prevFlag = process.env.STREAMING_PTT_ENABLED;
  const prevKey = process.env.OPENAI_API_KEY;
  process.env.STREAMING_PTT_ENABLED = "1";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.VOICE_BRIDGE_TEST_TRANSLATE = "1";
  resetRoomsForTests();

  t.after(async () => {
    process.env.STREAMING_PTT_ENABLED = prevFlag;
    process.env.OPENAI_API_KEY = prevKey;
    delete process.env.VOICE_BRIDGE_TEST_TRANSLATE;
    resetRoomsForTests();
  });

  const httpServer = createServer();
  const io = new Server(httpServer, { cors: { origin: true } });
  registerSocketHandlers(io, createSocketRateLimits(), {
    ...createDefaultSocketHandlerDeps(),
    runTranslationPipeline: createMockPipeline(),
    createRealtimeTranscriptionSession: (_apiKey, _handlers) => ({
      ready: Promise.resolve(),
      appendPcm16Base64: () => {},
      async finalize() {
        return "";
      },
      close() {},
    }),
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test server");
  }
  const url = `http://127.0.0.1:${address.port}`;
  const server = {
    close: () =>
      new Promise<void>((resolve, reject) => {
        io.close();
        httpServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
  t.after(() => server.close());

  const speaker = connectClient(url);
  const listener = connectClient(url);

  t.after(() => {
    speaker.disconnect();
    listener.disconnect();
  });

  await Promise.all([
    new Promise<void>((resolve) => speaker.once("connect", () => resolve())),
    new Promise<void>((resolve) => listener.once("connect", () => resolve())),
  ]);

  speaker.emit("join_room", {
    roomCode: "FALLBK",
    hearLang: "en",
    speakerGender: "female",
    streamingPtt: true,
  });
  listener.emit("join_room", {
    roomCode: "FALLBK",
    hearLang: "he",
    speakerGender: "male",
    streamingPtt: true,
    playTranslatedVoice: false,
  });

  await waitForEvent(speaker, "joined_room");
  await waitForEvent(listener, "joined_room");

  await new Promise<void>((resolve, reject) => {
    speaker.emit("claim_turn", {}, (response?: { ok?: boolean }) => {
      if (response?.ok) {
        resolve();
        return;
      }
      reject(new Error("claim_turn failed"));
    });
  });

  await new Promise<void>((resolve, reject) => {
    speaker.emit("streaming_ptt_start", {}, (response?: { ok?: boolean }) => {
      if (response?.ok) {
        resolve();
        return;
      }
      reject(new Error("streaming_ptt_start failed"));
    });
  });

  speaker.emit("streaming_ptt_stop", {
    audioBase64: VALID_TEST_AUDIO.toString("base64"),
    format: "wav",
    recordingDurationMs: 1200,
  });

  const finalTranscript = await waitForEvent<{ sourceText?: string }>(
    listener,
    "translation_transcript",
  );
  assert.equal(finalTranscript.sourceText, "batch fallback");
});
