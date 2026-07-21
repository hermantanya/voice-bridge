import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  turnActiveMs?: number;
  totalActiveConversationMs?: number;
  myBillableMs?: number;
  billableMsByParticipant?: Record<string, number>;
  sessionStartedAt?: number | null;
  /** @deprecated use totalActiveConversationMs */
  activeConversationMs?: number;
};

export type UsageSnapshot = {
  totalActiveConversationMs: number;
  myBillableMs: number;
  sessionStartedAt: number | null;
};

export type TranscriptEntry = {
  id: string;
  direction: "sent" | "received";
  sourceText: string;
  translatedText: string;
  receivedAt: number;
  latencyMs: number;
};

function createTranscriptEntry(
  direction: TranscriptEntry["direction"],
  payload: TranslationResult,
): TranscriptEntry {
  return {
    id: `${direction}-${payload.fromParticipantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    direction,
    sourceText: payload.sourceText,
    translatedText: payload.translatedText,
    receivedAt: Date.now(),
    latencyMs: payload.latencyMs,
  };
}

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
  totalActiveConversationMs?: number;
  billableMsByParticipant?: Record<string, number>;
  sessionStartedAt?: number | null;
  activeConversationMs?: number;
};

type UsagePayload = {
  totalActiveConversationMs?: number;
  billableMsByParticipant?: Record<string, number>;
  sessionStartedAt?: number | null;
  myBillableMs?: number;
  activeConversationMs?: number;
};

function hasParticipantUsageMap(
  map: Record<string, number> | undefined,
): map is Record<string, number> {
  return Boolean(map && Object.keys(map).length > 0);
}

function readTotalActiveMs(payload: UsagePayload): number | undefined {
  if (payload.totalActiveConversationMs !== undefined) {
    return payload.totalActiveConversationMs;
  }
  return payload.activeConversationMs;
}

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
  const pendingSpeechMsRef = useRef(0);
  const roomActiveSyncedAtRef = useRef(0);

  const applyUsagePayload = useCallback(
    (payload: UsagePayload, trustPayloadMyActive = false) => {
      const serverTotal = readTotalActiveMs(payload);

      if (serverTotal !== undefined) {
        roomActiveSyncedAtRef.current = Date.now();
        setTotalActiveConversationMs((current) => Math.max(current, serverTotal));
      }

      const me = participantIdRef.current;
      if (trustPayloadMyActive && payload.myBillableMs !== undefined) {
        setMyBillableMs((current) => Math.max(current, payload.myBillableMs!));
      } else if (hasParticipantUsageMap(payload.billableMsByParticipant) && me) {
        const mine = payload.billableMsByParticipant[me];
        if (mine !== undefined) {
          setMyBillableMs((current) => Math.max(current, mine));
        }
      }

      if (payload.sessionStartedAt !== undefined) {
        setSessionStartedAt(payload.sessionStartedAt);
      }
    },
    [],
  );

  const applyTurnUsage = useCallback(
    (payload: TranslationResult, role: "sent" | "received") => {
      let turnMs = payload.turnActiveMs ?? 0;

      if (turnMs <= 0 && role === "sent") {
        turnMs = pendingSpeechMsRef.current + Math.max(0, payload.latencyMs);
      }

      if (role === "sent") {
        pendingSpeechMsRef.current = 0;
      }

      if (turnMs > 0 && role === "sent") {
        setMyBillableMs((current) => current + turnMs);
      }

      applyUsagePayload(payload, role === "sent");

      if (turnMs > 0 && readTotalActiveMs(payload) === undefined) {
        setTotalActiveConversationMs((current) => current + turnMs);
      }
    },
    [applyUsagePayload],
  );

  const ensureSessionStartedLocally = useCallback((participants: number) => {
    if (participants >= 2) {
      setSessionStartedAt((current) => current ?? Date.now());
    } else {
      setSessionStartedAt(null);
    }
  }, []);

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
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [totalActiveConversationMs, setTotalActiveConversationMs] = useState(0);
  const [myBillableMs, setMyBillableMs] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [usageTick, setUsageTick] = useState(0);

  const isMyTurn =
    participantId !== null &&
    turnParticipantId === participantId &&
    turnPhase === "speaking";
  const isOpenTurn = turnPhase === "waiting";
  const isProcessing = turnPhase === "processing";

  useEffect(() => {
    if (!isProcessing) {
      return;
    }

    const timer = setInterval(() => {
      setUsageTick((tick) => tick + 1);
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, [isProcessing]);

  const displayTotalActiveConversationMs = useMemo(() => {
    if (!isProcessing) {
      return totalActiveConversationMs;
    }

    const syncedAt = roomActiveSyncedAtRef.current;
    if (syncedAt <= 0) {
      return totalActiveConversationMs;
    }

    return totalActiveConversationMs + (Date.now() - syncedAt);
  }, [isProcessing, totalActiveConversationMs, usageTick]);

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

    if (turnState.phase === "processing" && roomActiveSyncedAtRef.current <= 0) {
      roomActiveSyncedAtRef.current = Date.now();
    }
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
    setTranscript([]);
    setTotalActiveConversationMs(0);
    setMyBillableMs(0);
    setSessionStartedAt(null);
    roomActiveSyncedAtRef.current = 0;
    pendingSpeechMsRef.current = 0;
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
        setErrorMessage("Could not claim turn. Try again.");
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
    (
      audioBase64: string,
      format: string,
      recordingDurationMs: number,
      recordingStartedAt?: number,
    ) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("Not connected to server");
        return;
      }

      const me = participantIdRef.current;
      const turn = turnStateRef.current;

      if (!me || turn.turnParticipantId !== me) {
        setErrorMessage("Not your turn");
        return;
      }

      pendingSpeechMsRef.current = Math.max(0, Math.round(recordingDurationMs));

      setErrorMessage(null);
      socket.emit("audio_chunk", {
        audioBase64,
        format,
        sourceLang: myLang,
        recordingDurationMs: pendingSpeechMsRef.current,
        recordingStartedAt,
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
      applyUsagePayload(payload);
      ensureSessionStartedLocally(payload.participants);
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
      } & UsagePayload) => {
        setParticipants(payload.participants);
        applyUsagePayload(payload);
        ensureSessionStartedLocally(payload.participants);
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
      (payload: {
        participants: number;
        turnState?: TurnState;
      } & UsagePayload) => {
        setParticipants(payload.participants);
        if (payload.participants < 2) {
          setPartnerLang(null);
          resetTurnState();
        } else if (payload.turnState) {
          applyTurnState(payload.turnState);
        }
        applyUsagePayload(payload);
        ensureSessionStartedLocally(payload.participants);
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
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("received", payload),
      ]);
      applyTurnUsage(payload, "received");
      onIncomingRef.current?.(payload);
    });

    socket.on("translation_sent", (payload: TranslationResult) => {
      setLastSent(payload);
      setTranscript((current) => [
        ...current,
        createTranscriptEntry("sent", payload),
      ]);
      applyTurnUsage(payload, "sent");
    });

    socket.on(
      "usage_update",
      (payload: { roomCode: string } & UsagePayload) => {
        applyUsagePayload(payload);
      },
    );

    socket.on("error", (payload: { message?: string }) => {
      setErrorMessage(payload.message ?? "Unknown socket error");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    applyTurnState,
    applyTurnUsage,
    applyUsagePayload,
    disconnect,
    ensureSessionStartedLocally,
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
    transcript,
    totalActiveConversationMs: displayTotalActiveConversationMs,
    myBillableMs,
    sessionStartedAt,
    disconnect,
    claimTurn,
    sendAudioChunk,
  };
};
