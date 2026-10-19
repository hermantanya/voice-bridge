import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { SERVER_URL, type LanguageCode, type SpeakerGender } from "../config";
import {
  buildJoinRoomPayload,
  shouldApplyTurnState,
  shouldClearPartnerLang,
  type TurnState,
} from "../session/appState";
import {
  hasValidRecordingContainer,
  MIN_RECORDING_DURATION_MS,
  MIN_RECORDING_BYTES,
} from "../session/nativeRecordingFormat";

type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";
type TurnPhase = "waiting" | "speaking" | "processing";

export type TranslationTranscriptPayload = {
  roomCode: string;
  turnId: string;
  fromParticipantId: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  transcriptLatencyMs?: number;
  skippedTts?: boolean;
};

export type TranslationResult = {
  roomCode: string;
  turnId?: string;
  fromParticipantId: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  audioBase64: string;
  audioFormat: string;
  latencyMs: number;
  transcriptLatencyMs?: number;
  usedClonedVoice?: boolean;
  skippedTts?: boolean;
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
  turnId?: string;
  direction: "sent" | "received";
  sourceText: string;
  translatedText: string;
  receivedAt: number;
  latencyMs: number;
};

function transcriptKey(
  direction: TranscriptEntry["direction"],
  turnId: string,
): string {
  return `${direction}:${turnId}`;
}

function createTranscriptEntry(
  direction: TranscriptEntry["direction"],
  payload: TranslationResult | TranslationTranscriptPayload,
  latencyMs: number,
): TranscriptEntry {
  const turnId = payload.turnId;
  return {
    id:
      turnId ??
      `${direction}-${payload.fromParticipantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    turnId,
    direction,
    sourceText: payload.sourceText,
    translatedText: payload.translatedText,
    receivedAt: Date.now(),
    latencyMs,
  };
}

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

function readPartnerBillableMs(
  map: Record<string, number> | undefined,
  myParticipantId: string | null,
): number | undefined {
  if (!hasParticipantUsageMap(map) || !myParticipantId) {
    return undefined;
  }

  return Object.entries(map)
    .filter(([participantId]) => participantId !== myParticipantId)
    .reduce((sum, [, ms]) => sum + ms, 0);
}

type UseSocketOptions = {
  roomCode: string;
  myLang: LanguageCode;
  speakerGender: SpeakerGender;
  elevenlabsVoiceId?: string | null;
  playTranslatedVoice?: boolean;
  enabled: boolean;
  onIncomingTranslation?: (result: TranslationResult) => void;
};

export function useSocket({
  roomCode,
  myLang,
  speakerGender,
  elevenlabsVoiceId = null,
  playTranslatedVoice = true,
  enabled,
  onIncomingTranslation,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onIncomingRef = useRef(onIncomingTranslation);
  const myLangRef = useRef(myLang);
  const speakerGenderRef = useRef(speakerGender);
  const elevenlabsVoiceIdRef = useRef(elevenlabsVoiceId);
  const playTranslatedVoiceRef = useRef(playTranslatedVoice);
  const transcriptTurnKeysRef = useRef(new Set<string>());
  const connectedRef = useRef(false);

  const emitJoinRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomCodeRef.current) {
      return;
    }

    socket.emit(
      "join_room",
      buildJoinRoomPayload({
        roomCode: roomCodeRef.current,
        myLang: myLangRef.current,
        speakerGender: speakerGenderRef.current,
        elevenlabsVoiceId: elevenlabsVoiceIdRef.current,
        playTranslatedVoice: playTranslatedVoiceRef.current,
      }),
    );
  }, []);
  const roomCodeRef = useRef(roomCode);
  const turnStateRef = useRef<TurnState>({
    turnParticipantId: null,
    phase: "waiting",
    version: 0,
  });
  const participantIdRef = useRef<string | null>(null);
  const pendingSpeechMsRef = useRef(0);
  const roomActiveSyncedAtRef = useRef(0);

  const applyUsagePayload = useCallback(
    (
      payload: UsagePayload,
      options: {
        trustPayloadMyActive?: boolean;
        updateBillable?: boolean;
      } = {},
    ) => {
      const { trustPayloadMyActive = false, updateBillable = true } = options;
      const serverTotal = readTotalActiveMs(payload);

      if (serverTotal !== undefined) {
        roomActiveSyncedAtRef.current = Date.now();
        setTotalActiveConversationMs((current) => Math.max(current, serverTotal));
      }

      if (!updateBillable) {
        if (payload.sessionStartedAt !== undefined) {
          setSessionStartedAt(payload.sessionStartedAt);
        }
        return;
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

      const partnerTotal = readPartnerBillableMs(
        payload.billableMsByParticipant,
        me,
      );
      if (partnerTotal !== undefined) {
        setPartnerBillableMs((current) => Math.max(current, partnerTotal));
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
        if (
          !hasParticipantUsageMap(payload.billableMsByParticipant) &&
          payload.myBillableMs === undefined
        ) {
          setMyBillableMs((current) => current + turnMs);
        }
      }

      if (turnMs > 0 && role === "received") {
        if (!hasParticipantUsageMap(payload.billableMsByParticipant)) {
          setPartnerBillableMs((current) => current + turnMs);
        }
      }

      applyUsagePayload(payload, { trustPayloadMyActive: role === "sent" });

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
  const [partnerBillableMs, setPartnerBillableMs] = useState(0);
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
    myLangRef.current = myLang;
  }, [myLang]);

  useEffect(() => {
    speakerGenderRef.current = speakerGender;
  }, [speakerGender]);

  useEffect(() => {
    elevenlabsVoiceIdRef.current = elevenlabsVoiceId;
  }, [elevenlabsVoiceId]);

  useEffect(() => {
    playTranslatedVoiceRef.current = playTranslatedVoice;
  }, [playTranslatedVoice]);

  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  useEffect(() => {
    participantIdRef.current = participantId;
  }, [participantId]);

  const applyTurnState = useCallback((turnState: TurnState) => {
    if (!shouldApplyTurnState(turnStateRef.current, turnState)) {
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
    transcriptTurnKeysRef.current.clear();
    setTotalActiveConversationMs(0);
    setMyBillableMs(0);
    setPartnerBillableMs(0);
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

  const releaseTurn = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        resolve();
        return;
      }

      socket.emit("release_turn", {}, () => {
        const me = participantIdRef.current;
        const turn = turnStateRef.current;
        if (
          me &&
          turn.turnParticipantId === me &&
          turn.phase === "speaking"
        ) {
          applyTurnState({
            turnParticipantId: null,
            phase: "waiting",
            version: turn.version + 1,
          });
        }
        resolve();
      });
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

      const trimmed = audioBase64.trim();
      if (!trimmed) {
        setErrorMessage("Recording was empty. Hold the button a little longer.");
        return;
      }

      const byteLength = Math.floor((trimmed.length * 3) / 4);
      if (byteLength < MIN_RECORDING_BYTES) {
        setErrorMessage("Recording too short. Hold the button a little longer.");
        return;
      }

      if (!hasValidRecordingContainer(trimmed)) {
        setErrorMessage(
          "Could not read that recording. Hold the button a little longer and try again.",
        );
        return;
      }

      pendingSpeechMsRef.current = Math.max(0, Math.round(recordingDurationMs));
      if (pendingSpeechMsRef.current < MIN_RECORDING_DURATION_MS) {
        setErrorMessage(
          "Recording too short. Hold the button a little longer.",
        );
        return;
      }

      setErrorMessage(null);
      socket.emit("audio_chunk", {
        audioBase64: trimmed,
        format,
        recordingDurationMs: pendingSpeechMsRef.current,
        recordingStartedAt,
      });
    },
    [],
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
      connectedRef.current = true;
      setStatus("connected");
      emitJoinRoom();
    });

    socket.on("disconnect", () => {
      connectedRef.current = false;
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
        if (shouldClearPartnerLang(payload.participants)) {
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

    const appendTranscriptIfNew = (
      direction: TranscriptEntry["direction"],
      payload: TranslationResult | TranslationTranscriptPayload,
      latencyMs: number,
    ) => {
      if (payload.turnId) {
        const key = transcriptKey(direction, payload.turnId);
        if (transcriptTurnKeysRef.current.has(key)) {
          return;
        }
        transcriptTurnKeysRef.current.add(key);
      }

      setTranscript((current) => [
        ...current,
        createTranscriptEntry(direction, payload, latencyMs),
      ]);
    };

    const refreshTranscriptLatency = (
      direction: TranscriptEntry["direction"],
      turnId: string,
      latencyMs: number,
    ) => {
      setTranscript((current) =>
        current.map((entry) =>
          entry.turnId === turnId && entry.direction === direction
            ? { ...entry, latencyMs }
            : entry,
        ),
      );
    };

    socket.on("translation_transcript", (payload: TranslationTranscriptPayload) => {
      appendTranscriptIfNew(
        "received",
        payload,
        payload.transcriptLatencyMs ?? 0,
      );
    });

    socket.on(
      "translation_sent_transcript",
      (payload: TranslationTranscriptPayload) => {
        appendTranscriptIfNew(
          "sent",
          payload,
          payload.transcriptLatencyMs ?? 0,
        );
      },
    );

    socket.on("translation_result", (payload: TranslationResult) => {
      setLastReceived(payload);
      if (payload.turnId) {
        const key = transcriptKey("received", payload.turnId);
        if (transcriptTurnKeysRef.current.has(key)) {
          refreshTranscriptLatency("received", payload.turnId, payload.latencyMs);
        } else {
          appendTranscriptIfNew("received", payload, payload.latencyMs);
        }
      } else {
        appendTranscriptIfNew("received", payload, payload.latencyMs);
      }
      applyTurnUsage(payload, "received");
      onIncomingRef.current?.(payload);
    });

    socket.on("translation_sent", (payload: TranslationResult) => {
      setLastSent(payload);
      if (payload.turnId) {
        const key = transcriptKey("sent", payload.turnId);
        if (transcriptTurnKeysRef.current.has(key)) {
          refreshTranscriptLatency("sent", payload.turnId, payload.latencyMs);
        } else {
          appendTranscriptIfNew("sent", payload, payload.latencyMs);
        }
      } else {
        appendTranscriptIfNew("sent", payload, payload.latencyMs);
      }
      applyTurnUsage(payload, "sent");
    });

    socket.on(
      "usage_update",
      (payload: { roomCode: string } & UsagePayload) => {
        applyUsagePayload(payload, { updateBillable: false });
      },
    );

    socket.on(
      "participants_sync",
      (payload: {
        participants: number;
        turnState?: TurnState;
      } & UsagePayload) => {
        setParticipants(payload.participants);
        applyUsagePayload(payload);
        ensureSessionStartedLocally(payload.participants);
        if (payload.turnState) {
          applyTurnState(payload.turnState);
        }
      },
    );

    socket.on("error", (payload: { message?: string }) => {
      setErrorMessage(payload.message ?? "Unknown socket error");
    });

    return () => {
      connectedRef.current = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [
    applyTurnState,
    applyTurnUsage,
    applyUsagePayload,
    disconnect,
    emitJoinRoom,
    ensureSessionStartedLocally,
    enabled,
    resetTurnState,
    roomCode,
  ]);

  useEffect(() => {
    emitJoinRoom();
  }, [emitJoinRoom, elevenlabsVoiceId, myLang, playTranslatedVoice, speakerGender]);

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
    partnerBillableMs,
    sessionStartedAt,
    disconnect,
    claimTurn,
    releaseTurn,
    sendAudioChunk,
    setErrorMessage,
  };
};
