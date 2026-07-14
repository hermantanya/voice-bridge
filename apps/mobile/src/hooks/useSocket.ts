import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { SERVER_URL, type LanguageCode } from "../config";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

type JoinedRoomPayload = {
  roomCode: string;
  participantId: string;
  participants: number;
  speakLang: LanguageCode;
  hearLang: LanguageCode;
};

type UseSocketOptions = {
  roomCode: string;
  speakLang: LanguageCode;
  hearLang: LanguageCode;
  enabled: boolean;
};

export function useSocket({
  roomCode,
  speakLang,
  hearLang,
  enabled,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus("disconnected");
    setParticipantId(null);
    setParticipants(0);
  }, []);

  useEffect(() => {
    if (!enabled || !roomCode) {
      disconnect();
      return;
    }

    setStatus("connecting");
    setErrorMessage(null);

    const socket = io(SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      socket.emit("join_room", { roomCode, speakLang, hearLang });
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
    });

    socket.on("connect_error", (error) => {
      setStatus("error");
      setErrorMessage(error.message);
    });

    socket.on("joined_room", (payload: JoinedRoomPayload) => {
      setParticipantId(payload.participantId);
      setParticipants(payload.participants);
    });

    socket.on("participant_joined", (payload: { participants: number }) => {
      setParticipants(payload.participants);
    });

    socket.on("participant_left", (payload: { participants: number }) => {
      setParticipants(payload.participants);
    });

    socket.on("error", (payload: { message?: string }) => {
      setErrorMessage(payload.message ?? "Unknown socket error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [disconnect, enabled, hearLang, roomCode, speakLang]);

  return {
    status,
    participantId,
    participants,
    errorMessage,
    disconnect,
  };
}
