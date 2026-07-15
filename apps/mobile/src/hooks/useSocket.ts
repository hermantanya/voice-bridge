import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { SERVER_URL, type LanguageCode } from "../config";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type TurnPhase = "waiting" | "speaking" | "processing";

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

type TurnState = {
  turnParticipantId: string | null;
  phase: TurnPhase;
  version: number;
};

type JoinedRoomPayload = {
  roomCode: string;
  participantId: string;
  participants: number;
  myLang: LanguageCode;
  partnerLang?: LanguageCode;
  turnState?: TurnState;
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
  const turnStateRef = useRef<TurnState>({
    turnParticipantId: null,
    phase: "waiting",
    version: 0,
  });
  const participantIdRef = useRef<string | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [participants, setParticipants] = useState(0);
  const [partnerLang, setPartnerLang] = useState<LanguageCode | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [turnParticipantId, setTurnParticipantId] = useState<string | null>(
    null,
  );
  const [turnPhase, setTurnPhase] = useState<TurnPhase>("waiting");
  const [lastSent, setLastSent] = useState<TranslationResult | null>(null);
  const [lastReceived, setLastReceived] = useState<TranslationResult | null>(
    null,
  );

  const isMyTurn =
    participantId !== null &&
    turnParticipantId === participantId &&
    turnPhase === "speaking";
  const isOpenTurn = turnPhase === "waiting";
  const isProcessing = turnPhase === "processing";

  useEffect(() => {
    onIncomingRef.current = onIncomingTranslation;
  }, [onIncomingTranslation]);

  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  const applyTurnState = useCallback((turnState: TurnState) => {
    if (turnState.version < turnStateRef.current.version) {
      return;
    }

    turnStateRef.current = turnState;
    setTurnParticipantId(turnState.turnParticipantId);
    setTurnPhase(turnState.phase);
  }, []);

  const resetTurnState = useCallback(() => {
    applyTurnState({
      turnParticipantId: null,
      phase: "waiting",
      version: 0,
    });
  }, [applyTurnState]);

  const disconnect = useCallback(() => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    setStatus("disconnected");
    setParticipantId(null);
    participantIdRef.current = null;
    setParticipants(0);
    setPartnerLang(null);
    resetTurnState();
  }, [resetTurnState]);

  const claimTurn = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve(false);
        return;
      }

      const timeout = setTimeout(() => {
        setErrorMessage("Could not claim turn — try again");
        resolve(false);
      }, 3000);

      socket.emit(
        "claim_turn",
        {},
        (response?: { ok?: boolean; message?: string }) => {
          clearTimeout(timeout);

          if (response?.ok) {
            const me = participantIdRef.current;
            if (me) {
              applyTurnState({
                turnParticipantId: me,
                phase: "speaking",
                version: turnStateRef.current.version + 1,
              });
            }
            setErrorMessage(null);
            resolve(true);
            return;
          }

          if (response?.message) {
            setErrorMessage(response.message);
          }
          resolve(false);
        },
      );
    });
  }, [applyTurnState]);

  const sendAudioChunk = useCallback(
    (audioBase64: string, format: string) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("Not connected to server");
        return;
      }

      const turn = turnStateRef.current;
      const me = participantIdRef.current;

      if (
        turn.phase !== "speaking" ||
        !me ||
        turn.turnParticipantId !== me
      ) {
        setErrorMessage("Not your turn");
        return;
      }

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
    });

    socket.on("connect_error", (error) => {
      setStatus("error");
      setErrorMessage(error.message);
    });

    socket.on("joined_room", (payload: JoinedRoomPayload) => {
      setParticipantId(payload.participantId);
      participantIdRef.current = payload.participantId;
      setParticipants(payload.participants);
      setPartnerLang(payload.partnerLang ?? null);
      if (payload.turnState) {
        applyTurnState(payload.turnState);
      }
    });

    socket.on(
      "participant_joined",
      (payload: {
        participants: number;
        myLang?: LanguageCode;
        turnState?: TurnState;
      }) => {
        setParticipants(payload.participants);
        if (payload.myLang) {
          setPartnerLang(payload.myLang);
        }
        if (payload.turnState) {
          applyTurnState(payload.turnState);
        }
      },
    );

    socket.on(
      "participant_left",
      (payload: { participants: number; turnState?: TurnState }) => {
        setParticipants(payload.participants);
        if (payload.participants < 2) {
          setPartnerLang(null);
          resetTurnState();
        } else if (payload.turnState) {
          applyTurnState(payload.turnState);
        }
      },
    );

    socket.on(
      "turn_state",
      (payload: { roomCode: string } & TurnState) => {
        applyTurnState(payload);
      },
    );

    socket.on("translation_result", (payload: TranslationResult) => {
      setLastReceived(payload);
      onIncomingRef.current?.(payload);
    });

    socket.on("translation_sent", (payload: TranslationResult) => {
      setLastSent(payload);
    });

    socket.on("error", (payload: { message?: string }) => {
      setErrorMessage(payload.message ?? "Unknown socket error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    applyTurnState,
    disconnect,
    enabled,
    myLang,
    resetTurnState,
    roomCode,
  ]);

  return {
    status,
    participantId,
    participants,
    partnerLang,
    errorMessage,
    turnParticipantId,
    turnPhase,
    isMyTurn,
    isOpenTurn,
    isProcessing,
    lastSent,
    lastReceived,
    disconnect,
    claimTurn,
    sendAudioChunk,
  };
};
