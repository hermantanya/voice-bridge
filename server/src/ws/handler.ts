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

const rooms = new Map<string, Set<string>>();

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    console.log(`client connected: ${socket.id}`);

    socket.on("join_room", (payload: JoinRoomPayload) => {
      const { roomCode, speakLang, hearLang } = payload;

      if (!roomCode?.trim()) {
        socket.emit("error", { message: "roomCode is required" });
        return;
      }

      const code = roomCode.trim().toUpperCase();
      socket.join(code);

      if (!rooms.has(code)) {
        rooms.set(code, new Set());
      }
      rooms.get(code)!.add(socket.id);

      socket.data.roomCode = code;
      socket.data.speakLang = speakLang ?? "en";
      socket.data.hearLang = hearLang ?? "he";

      const participants = rooms.get(code)!.size;

      socket.emit("joined_room", {
        roomCode: code,
        participantId: socket.id,
        participants,
        speakLang: socket.data.speakLang,
        hearLang: socket.data.hearLang,
      });

      socket.to(code).emit("participant_joined", {
        participantId: socket.id,
        participants,
      });

      console.log(`socket ${socket.id} joined room ${code} (${participants} participants)`);
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

      try {
        const audio = Buffer.from(payload.audioBase64, "base64");
        const sourceLang =
          payload.sourceLang ?? (socket.data.speakLang as string) ?? "en";
        const targetLang = payload.targetLang ?? "he";

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
      } catch (error) {
        console.error(`audio_chunk error for ${socket.id}:`, error);
        socket.emit("error", {
          message: error instanceof Error ? error.message : "Translation failed",
        });
      }
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode as string | undefined;

      if (code && rooms.has(code)) {
        rooms.get(code)!.delete(socket.id);
        if (rooms.get(code)!.size === 0) {
          rooms.delete(code);
        } else {
          socket.to(code).emit("participant_left", {
            participantId: socket.id,
            participants: rooms.get(code)!.size,
          });
        }
      }

      console.log(`client disconnected: ${socket.id}`);
    });
  });
}
