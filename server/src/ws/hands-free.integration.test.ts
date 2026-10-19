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

/** Must exceed MIN_AUDIO_BYTES (1600) and MIN_ENCODED_AUDIO_BYTES (512) in audioFormat. */
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

function createMockPipeline(
  delayMs: number,
): { runner: TranslationPipelineRunner; labels: string[] } {
  const labels: string[] = [];
  let seq = 0;

  const runner: TranslationPipelineRunner = async (
    _input: PipelineInput,
  ): Promise<PipelineResult> => {
    const label = `utterance-${++seq}`;
    labels.push(label);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return {
      sourceLang: "en",
      targetLang: "he",
      sourceText: label,
      translatedText: `translated-${label}`,
      audio: Buffer.alloc(64, 0xab),
      audioFormat: "mp3",
      latencyMs: delayMs,
    };
  };

  return { runner, labels };
}

async function startTestServer(runPipeline: TranslationPipelineRunner): Promise<{
  httpServer: HttpServer;
  io: Server;
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
    io,
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

async function joinHandsFreeRoom(
  url: string,
  roomCode: string,
  hearLang: string,
): Promise<ClientSocket> {
  const socket = await connectClient(url);
  const joinedPromise = waitForEvent<{ participants: number }>(
    socket,
    "joined_room",
  );
  socket.emit("join_room", {
    roomCode,
    hearLang,
    speakerGender: "female",
    conversationMode: "hands_free",
  });
  await joinedPromise;
  return socket;
}

test("utterance is rejected when client joined in push_to_talk mode", async () => {
  resetRoomsForTests();
  const { runner } = createMockPipeline(0);
  const server = await startTestServer(runner);
  const roomCode = "HFREJ01";
  let socket: ClientSocket | undefined;

  try {
    socket = await connectClient(server.url);
    socket.emit("join_room", {
      roomCode,
      hearLang: "en",
      speakerGender: "female",
    });
    await waitForEvent(socket, "joined_room");

    const errorPromise = waitForEvent<{ message?: string }>(socket, "error");
    socket.emit("utterance", {
      audioBase64: VALID_TEST_AUDIO.toString("base64"),
      format: "wav",
      recordingDurationMs: 500,
    });

    const errorPayload = await errorPromise;
    assert.match(
      errorPayload.message ?? "",
      /hands-free conversation mode/i,
    );
  } finally {
    socket?.disconnect();
    await server.close();
  }
});

test("overlapping hands-free utterances from both speakers complete without turn lock", async () => {
  resetRoomsForTests();
  const { runner } = createMockPipeline(80);
  const server = await startTestServer(runner);
  const roomCode = "HFOVL01";
  const clients: Array<() => void> = [];

  try {
    const host = await joinHandsFreeRoom(server.url, roomCode, "en");
    const guest = await joinHandsFreeRoom(server.url, roomCode, "he");
    clients.push(() => host.disconnect(), () => guest.disconnect());

    const hostHeard = waitForEvent<{ sourceText?: string }>(
      host,
      "translation_result",
    );
    const guestHeard = waitForEvent<{ sourceText?: string }>(
      guest,
      "translation_result",
    );

    host.emit("utterance", {
      audioBase64: VALID_TEST_AUDIO.toString("base64"),
      format: "wav",
      recordingDurationMs: 500,
    });
    guest.emit("utterance", {
      audioBase64: VALID_TEST_AUDIO.toString("base64"),
      format: "wav",
      recordingDurationMs: 500,
    });

    const [hostPayload, guestPayload] = await Promise.all([
      hostHeard,
      guestHeard,
    ]);

    assert.ok(hostPayload.sourceText?.startsWith("utterance-"));
    assert.ok(guestPayload.sourceText?.startsWith("utterance-"));
    assert.notEqual(hostPayload.sourceText, guestPayload.sourceText);
  } finally {
    for (const disconnect of clients) {
      disconnect();
    }
    await server.close();
  }
});
