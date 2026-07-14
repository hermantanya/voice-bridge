import type { Server, Socket } from "socket.io";

type JoinRoomPayload = {
  roomCode: string;
  speakLang?: string;
  hearLang?: string;
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
