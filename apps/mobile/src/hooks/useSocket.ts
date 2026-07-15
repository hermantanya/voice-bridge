import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { SERVER_URL, type LanguageCode } from "../config";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type TranslationResult = {
  roomCode: string;
  fromParticipantId: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  audioBase64: string;
  audioFormat: string;
  latencyMs: number;
};

type JoinedRoomPayload = {
  roomCode: string;
  participantId: string;
  participants: number;
  myLang: LanguageCode;
  partnerLang?: LanguageCode;
};

type UseSocketOptions = {
  roomCode: string;
  myLang: LanguageCode;
  enabled: boolean;
  onIncomingTranslation?: (result: TranslationResult) => void;
};

export function useSocket({
  roomCode,
  myLang,
  enabled,
  onIncomingTranslation,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onIncomingRef = useRef(onIncomingTranslation);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [partnerLang, setPartnerLang] = useState<LanguageCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);
  const [lastSent, setLastSent] = useState<TranslationResult | null>(null);
  const [lastReceived, setLastReceived] = useState<TranslationResult | null>(
    null,
  );

  useEffect(() => {
    onIncomingRef.current = onIncomingTranslation;
  }, [onIncomingTranslation]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus("disconnected");
    setParticipantId(null);
    setParticipants(0);
    setPartnerLang(null);
    setIsTranslating(false);
  }, []);

  const sendAudioChunk = useCallback(
    (audioBase64: string, format: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("Not connected to server");
        return;
      }

      setIsTranslating(true);
      setErrorMessage(null);
      socket.emit("audio_chunk", {
        audioBase64,
        format,
        sourceLang: myLang,
      });
    },
    [myLang],
  );

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
      socket.emit("join_room", {
        roomCode,
        speakLang: myLang,
        hearLang: myLang,
      });
    });

    socket.on("disconnect", () => {
      setStatus("disconnected");
      setIsTranslating(false);
    });

    socket.on("connect_error", (error) => {
      setStatus("error");
      setErrorMessage(error.message);
      setIsTranslating(false);
    });

    socket.on("joined_room", (payload: JoinedRoomPayload) => {
      setParticipantId(payload.participantId);
      setParticipants(payload.participants);
      setPartnerLang(payload.partnerLang ?? null);
    });

    socket.on(
      "participant_joined",
      (payload: { participants: number; myLang?: LanguageCode }) => {
        setParticipants(payload.participants);
        if (payload.myLang) {
          setPartnerLang(payload.myLang);
        }
      },
    );

    socket.on("participant_left", (payload: { participants: number }) => {
      setParticipants(payload.participants);
      if (payload.participants < 2) {
        setPartnerLang(null);
      }
    });

    socket.on("translation_result", (payload: TranslationResult) => {
      setLastReceived(payload);
      setIsTranslating(false);
      onIncomingRef.current?.(payload);
    });

    socket.on("translation_sent", (payload: TranslationResult) => {
      setLastSent(payload);
      setIsTranslating(false);
    });

    socket.on("error", (payload: { message?: string }) => {
      setErrorMessage(payload.message ?? "Unknown socket error");
      setIsTranslating(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [disconnect, enabled, myLang, roomCode]);

  return {
    status,
    participantId,
    participants,
    partnerLang,
    errorMessage,
    isTranslating,
    lastSent,
    lastReceived,
    disconnect,
    sendAudioChunk,
  };
}
