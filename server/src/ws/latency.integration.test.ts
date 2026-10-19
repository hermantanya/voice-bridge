import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import test from "node:test";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { Server } from "socket.io";

import type { PipelineInput, PipelineResult } from "../pipeline/index.js";
import {
  createDefaultSocketHandlerDeps,
  registerSocketHandlers,
  resetRoomsForTests,
  type TranslationPipelineRunner,
} from "./handler.js";
import { createSocketRateLimits } from "./rateLimit.js";

/** GitHub Actions runners can be slow to connect WebSockets; allow extra headroom in CI. */
const EVENT_TIMEOUT_MS = process.env.CI === "true" ? 20_000 : 10_000;

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

function createStagedMockPipeline(ttsDelayMs: number): TranslationPipelineRunner {
  return async (input: PipelineInput): Promise<PipelineResult> => {
    await input.onTranscriptReady?.({
      sourceLang: "en",
      targetLang: "he",
      sourceText: "hello",
      translatedText: "shalom",
      transcriptLatencyMs: 12,
      skippedTts: Boolean(input.skipTts),
      timing: { sttMs: 5, translateMs: 7, ttsMs: 0 },
    });

    if (!input.skipTts) {
      await new Promise((resolve) => setTimeout(resolve, ttsDelayMs));
    }

    return {
      sourceLang: "en",
      targetLang: "he",
      sourceText: "hello",
      translatedText: "shalom",
      audio: input.skipTts ? Buffer.alloc(0) : Buffer.alloc(64, 0xab),
      audioFormat: "mp3",
      latencyMs: 12 + (input.skipTts ? 0 : ttsDelayMs),
      transcriptLatencyMs: 12,
      skippedTts: Boolean(input.skipTts),
      timing: {
        sttMs: 5,
        translateMs: 7,
        ttsMs: input.skipTts ? 0 : ttsDelayMs,
      },
    };
  };
}

async function startTestServer(runPipeline: TranslationPipelineRunner): Promise<{
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
    runTranslationPipeline: runPipeline,
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
    close: async () => {
      await io.close();
      if (httpServer.listening) {
        await new Promise<void>((resolve, reject) => {
          httpServer.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        });
      }
    },
  };
}

async function connectClient(url: string): Promise<ClientSocket> {
  const socket = createClient(url, {
    transports: ["websocket"],
    forceNew: true,
    timeout: EVENT_TIMEOUT_MS,
  });
  await waitForEvent(socket, "connect");
  return socket;
}

async function joinPair(
  url: string,
  roomCode: string,
  guestOptions?: { playTranslatedVoice?: boolean },
): Promise<{ host: ClientSocket; guest: ClientSocket; cleanup: () => void }> {
  const host = await connectClient(url);
  const guest = await connectClient(url);

  const hostJoined = waitForEvent<{ participants: number }>(host, "joined_room");
  host.emit("join_room", {
    roomCode,
    hearLang: "en",
    speakerGender: "female",
  });

  const guestJoined = waitForEvent<{ participants: number }>(guest, "joined_room");
  guest.emit("join_room", {
    roomCode,
    hearLang: "he",
    speakerGender: "female",
    playTranslatedVoice: guestOptions?.playTranslatedVoice,
  });

  await hostJoined;
  await guestJoined;

  return {
    host,
    guest,
    cleanup: () => {
      host.disconnect();
      guest.disconnect();
    },
  };
}

test("translation_transcript arrives before translation_result", async () => {
  resetRoomsForTests();
  const server = await startTestServer(createStagedMockPipeline(80));

  try {
    const { host, guest, cleanup } = await joinPair(server.url, "LAT01");
    try {
      await new Promise<void>((resolve, reject) => {
        host.emit("claim_turn", {}, (response?: { ok?: boolean }) => {
          if (!response?.ok) {
            reject(new Error("claim_turn failed"));
            return;
          }
          resolve();
        });
      });

      const events: string[] = [];
      const transcriptPromise = waitForEvent<{ turnId: string; translatedText: string }>(
        guest,
        "translation_transcript",
      ).then((payload) => {
        events.push("translation_transcript");
        return payload;
      });
      const resultPromise = waitForEvent<{ turnId: string; audioBase64: string }>(
        guest,
        "translation_result",
      ).then((payload) => {
        events.push("translation_result");
        return payload;
      });

      host.emit("audio_chunk", {
        audioBase64: VALID_TEST_AUDIO.toString("base64"),
        format: "wav",
        recordingDurationMs: 900,
      });

      const [transcript, result] = await Promise.all([
        transcriptPromise,
        resultPromise,
      ]);

      assert.deepEqual(events, ["translation_transcript", "translation_result"]);
      assert.equal(transcript.turnId, result.turnId);
      assert.equal(transcript.translatedText, "shalom");
      assert.ok(result.audioBase64.length > 0);
    } finally {
      cleanup();
    }
  } finally {
    await server.close();
  }
});

test("playTranslatedVoice false skips TTS in pipeline", async () => {
  resetRoomsForTests();
  const server = await startTestServer(createStagedMockPipeline(80));

  try {
    const { host, guest, cleanup } = await joinPair(server.url, "LAT02", {
      playTranslatedVoice: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        host.emit("claim_turn", {}, (response?: { ok?: boolean }) => {
          if (!response?.ok) {
            reject(new Error("claim_turn failed"));
            return;
          }
          resolve();
        });
      });

      const transcriptPromise = waitForEvent<{ skippedTts: boolean }>(
        guest,
        "translation_transcript",
      );
      const resultPromise = waitForEvent<{
        skippedTts: boolean;
        audioBase64: string;
      }>(guest, "translation_result");

      host.emit("audio_chunk", {
        audioBase64: VALID_TEST_AUDIO.toString("base64"),
        format: "wav",
        recordingDurationMs: 900,
      });

      const [transcript, result] = await Promise.all([
        transcriptPromise,
        resultPromise,
      ]);

      assert.equal(transcript.skippedTts, true);
      assert.equal(result.skippedTts, true);
      assert.equal(result.audioBase64, "");
    } finally {
      cleanup();
    }
  } finally {
    await server.close();
  }
});
