import assert from "node:assert/strict";
import { createServer, type Server as HttpServer } from "node:http";
import test from "node:test";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { Server } from "socket.io";

import { registerSocketHandlers } from "./handler.js";
import { createSocketRateLimits } from "./rateLimit.js";

type JoinedRoomPayload = {
  participants: number;
  roomCode: string;
};

function waitForTurnPhase(
  socket: ClientSocket,
  phase: string,
  timeoutMs = 5000,
): Promise<{ phase: string; turnParticipantId: string | null }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("turn_state", handler);
      reject(new Error(`Timed out waiting for turn_state phase=${phase}`));
    }, timeoutMs);

    const handler = (payload: { phase: string; turnParticipantId: string | null }) => {
      if (payload.phase === phase) {
        clearTimeout(timer);
        socket.off("turn_state", handler);
        resolve(payload);
      }
    };

    socket.on("turn_state", handler);
  });
}

function waitForEvent<T>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 5000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);

    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function startTestServer(): Promise<{
  httpServer: HttpServer;
  io: Server;
  url: string;
  close: () => Promise<void>;
}> {
  const httpServer = createServer();
  const io = new Server(httpServer, {
    cors: { origin: true },
  });

  registerSocketHandlers(io, createSocketRateLimits());

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

async function joinRoom(
  url: string,
  roomCode: string,
  speakLang = "en",
): Promise<{
  socket: ClientSocket;
  joined: JoinedRoomPayload;
  disconnect: () => void;
}> {
  const socket = createClient(url, {
    transports: ["websocket"],
    forceNew: true,
  });

  await waitForEvent(socket, "connect");

  const joinedPromise = waitForEvent<JoinedRoomPayload>(socket, "joined_room");
  socket.emit("join_room", {
    roomCode,
    speakLang,
    hearLang: speakLang,
    speakerGender: "female",
  });

  const joined = await joinedPromise;
  return { socket, joined, disconnect: () => socket.disconnect() };
}

test("two clients joining the same room both end up with two participants", async () => {
  const server = await startTestServer();
  const roomCode = "TEST01";
  const clients: Array<() => void> = [];

  try {
    const { socket: host, joined: hostJoined, disconnect: disconnectHost } =
      await joinRoom(server.url, roomCode, "en");
    clients.push(disconnectHost);
    assert.equal(hostJoined.participants, 1);

    const guestJoinedPromise = waitForEvent<JoinedRoomPayload>(
      host,
      "participant_joined",
    );
    const { joined: guestJoined, disconnect: disconnectGuest } = await joinRoom(
      server.url,
      roomCode,
      "he",
    );
    clients.push(disconnectGuest);

    assert.equal(guestJoined.participants, 2);

    const hostUpdate = await guestJoinedPromise;
    assert.equal(hostUpdate.participants, 2);
  } finally {
    for (const disconnect of clients) {
      disconnect();
    }
    await server.close();
  }
});

test("release_turn reopens the floor for the current speaker", async () => {
  const server = await startTestServer();
  const roomCode = "REL01";
  const clients: Array<() => void> = [];

  try {
    const { socket: host, disconnect: disconnectHost } = await joinRoom(
      server.url,
      roomCode,
      "en",
    );
    clients.push(disconnectHost);
    const { socket: guest, disconnect: disconnectGuest } = await joinRoom(
      server.url,
      roomCode,
      "he",
    );
    clients.push(disconnectGuest);

    await new Promise<void>((resolve, reject) => {
      host.emit("claim_turn", {}, (response?: { ok?: boolean }) => {
        if (!response?.ok) {
          reject(new Error("claim_turn failed"));
          return;
        }
        resolve();
      });
    });

    const turnStatePromise = waitForTurnPhase(guest, "waiting");

    await new Promise<void>((resolve, reject) => {
      host.emit("release_turn", {}, (response?: { ok?: boolean }) => {
        if (!response?.ok) {
          reject(new Error("release_turn failed"));
          return;
        }
        resolve();
      });
    });

    const turnState = await turnStatePromise;
    assert.equal(turnState.phase, "waiting");
    assert.equal(turnState.turnParticipantId, null);
  } finally {
    for (const disconnect of clients) {
      disconnect();
    }
    await server.close();
  }
});

test("concurrent joins still converge to two participants", async () => {
  const server = await startTestServer();
  const roomCode = "RACE01";
  const clients: Array<() => void> = [];

  try {
    const [{ socket: first, joined: firstJoined, disconnect: disconnectFirst }, { joined: secondJoined, disconnect: disconnectSecond }] =
      await Promise.all([
        joinRoom(server.url, roomCode, "en"),
        joinRoom(server.url, roomCode, "he"),
      ]);
    clients.push(disconnectFirst, disconnectSecond);

    const counts = [firstJoined.participants, secondJoined.participants];
    assert.equal(Math.max(...counts), 2);

    if (firstJoined.participants < 2) {
      const firstUpdate = await Promise.race([
        waitForEvent<JoinedRoomPayload>(first, "participant_joined"),
        waitForEvent<JoinedRoomPayload>(first, "participants_sync"),
      ]);
      assert.equal(firstUpdate.participants, 2);
    }
  } finally {
    for (const disconnect of clients) {
      disconnect();
    }
    await server.close();
  }
});
