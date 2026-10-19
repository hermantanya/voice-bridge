import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

import { SERVER_URL, type LanguageCode, type SpeakerGender } from "../config";
import { shouldRequestStreamingPttOnJoin } from "../session/streamingPtt";
import {
  buildJoinRoomPayload,
  shouldApplyTurnState,
  shouldClearPartnerLang,
  type TurnState,
} from "../session/appState";
import { streamingPttDebugLog } from "../session/streamingPtt";
import {
  hasValidRecordingContainer,
  MIN_RECORDING_DURATION_MS,
  MIN_RECORDING_BYTES,
} from "../session/nativeRecordingFormat";
import {
  appendTranscriptIfNew,
  applyTranslationResultToTranscript,
  applyTranslationSentToTranscript,
  flushPartnerPartialToTranscript,
  mergePartnerPartial,
  type PartnerPartial,
  type TranscriptEntry,
} from "../session/transcriptState";
import {
  isLiveTranscriptionUnavailableMessage,
  isLocalStreamingSpeakerTurn,
  shouldPlayTranslationAudio,
} from "../session/translationPlayback";

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

export type { TranscriptEntry };

type JoinedRoomPayload = {
  roomCode: string;
  participantId: string;
  participants: number;
  myLang: LanguageCode;
  partnerLang?: LanguageCode;
  turnState?: TurnState;
  streamingPttEnabled?: boolean;
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

export type PartialTranslationPayload = {
  roomCode: string;
  turnId: string;
  fromParticipantId: string;
  sourceText?: string;
  translatedText: string;
  targetLang?: string;
  isPartial?: boolean;
};

type UseSocketOptions = {
  roomCode: string;
  myLang: LanguageCode;
  speakerGender: SpeakerGender;
  elevenlabsVoiceId?: string | null;
  playTranslatedVoice?: boolean;
  streamingPtt?: boolean;
  enabled: boolean;
  onIncomingTranslation?: (result: TranslationResult) => void;
  onPartialTranslationAudio?: (payload: {
    audioBase64?: string;
    translatedText?: string;
    fromParticipantId?: string;
    turnId?: string;
    role?: string;
  }) => void;
};

export function useSocket({
  roomCode,
  myLang,
  speakerGender,
  elevenlabsVoiceId = null,
  playTranslatedVoice = true,
  streamingPtt = false,
  enabled,
  onIncomingTranslation,
  onPartialTranslationAudio,
}: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const onIncomingRef = useRef(onIncomingTranslation);
  const onPartialAudioRef = useRef(onPartialTranslationAudio);
  const myLangRef = useRef(myLang);
  const speakerGenderRef = useRef(speakerGender);
  const elevenlabsVoiceIdRef = useRef(elevenlabsVoiceId);
  const playTranslatedVoiceRef = useRef(playTranslatedVoice);
  const streamingPttRef = useRef(streamingPtt);
  const streamingSessionActiveRef = useRef(false);
  const streamingChunkCountRef = useRef(0);
  const transcriptTurnKeysRef = useRef(new Set<string>());
  const partnerPartialRef = useRef<PartnerPartial | null>(null);
  const connectedRef = useRef(false);

  const emitJoinRoom = useCallback(() => {
    const socket = socketRef.current;
    if (!socket?.connected || !roomCodeRef.current) {
      return;
    }

    const requestStreaming =
      shouldRequestStreamingPttOnJoin() || streamingPttRef.current;
    socket.emit(
      "join_room",
      buildJoinRoomPayload({
        roomCode: roomCodeRef.current,
        myLang: myLangRef.current,
        speakerGender: speakerGenderRef.current,
        elevenlabsVoiceId: elevenlabsVoiceIdRef.current,
        playTranslatedVoice: playTranslatedVoiceRef.current,
        streamingPtt: requestStreaming ? true : undefined,
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
  const [partnerPartial, setPartnerPartialState] = useState<PartnerPartial | null>(
    null,
  );
  const [serverStreamingPttEnabled, setServerStreamingPttEnabled] =
    useState(false);

  const setPartnerPartial = useCallback((value: PartnerPartial | null) => {
    partnerPartialRef.current = value;
    setPartnerPartialState(value);
  }, []);

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
    onPartialAudioRef.current = onPartialTranslationAudio;
  }, [onIncomingTranslation, onPartialTranslationAudio]);

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
    streamingPttRef.current = streamingPtt;
  }, [streamingPtt]);

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
    partnerPartialRef.current = null;
    setPartnerPartialState(null);
    streamingSessionActiveRef.current = false;
    streamingChunkCountRef.current = 0;
    transcriptTurnKeysRef.current.clear();
    setTotalActiveConversationMs(0);
    setMyBillableMs(0);
    setPartnerBillableMs(0);
    setSessionStartedAt(null);
    setServerStreamingPttEnabled(false);
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
    ): boolean => {
      const socket = socketRef.current;
      if (!socket?.connected) {
        setErrorMessage("Not connected to server");
        return false;
      }

      const me = participantIdRef.current;
      const turn = turnStateRef.current;

      if (!me || turn.turnParticipantId !== me) {
        setErrorMessage("Not your turn");
        return false;
      }

      const trimmed = audioBase64.trim();
      if (!trimmed) {
        setErrorMessage("Recording was empty. Hold the button a little longer.");
        return false;
      }

      const byteLength = Math.floor((trimmed.length * 3) / 4);
      if (byteLength < MIN_RECORDING_BYTES) {
        setErrorMessage("Recording too short. Hold the button a little longer.");
        return false;
      }

      if (!hasValidRecordingContainer(trimmed)) {
        setErrorMessage(
          "Could not read that recording. Hold the button a little longer and try again.",
        );
        return false;
      }

      pendingSpeechMsRef.current = Math.max(0, Math.round(recordingDurationMs));
      if (pendingSpeechMsRef.current < MIN_RECORDING_DURATION_MS) {
        setErrorMessage(
          "Recording too short. Hold the button a little longer.",
        );
        return false;
      }

      setErrorMessage(null);
      socket.emit("audio_chunk", {
        audioBase64: trimmed,
        format,
        recordingDurationMs: pendingSpeechMsRef.current,
        recordingStartedAt,
      });
      return true;
    },
    [],
  );

  const isStreamingPttClientEnabled = useCallback((): boolean => {
    return streamingPttRef.current || serverStreamingPttEnabled;
  }, [serverStreamingPttEnabled]);

  const isLocalStreamingSpeaker = useCallback((): boolean => {
    return isLocalStreamingSpeakerTurn(
      participantIdRef.current,
      turnStateRef.current.turnParticipantId,
      turnStateRef.current.phase,
    );
  }, []);

  const startStreamingPtt = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const socket = socketRef.current;
      if (!socket?.connected || !isStreamingPttClientEnabled()) {
        streamingPttDebugLog("start skipped (not connected or flag off)");
        resolve(false);
        return;
      }

      if (!isLocalStreamingSpeaker()) {
        streamingPttDebugLog("start skipped (listener — no streaming uplink)");
        resolve(false);
        return;
      }

      streamingSessionActiveRef.current = false;
      streamingChunkCountRef.current = 0;
      streamingPttDebugLog("streaming_ptt_start emit");

      socket.emit(
        "streaming_ptt_start",
        {},
        (response?: { ok?: boolean; message?: string }) => {
          if (response?.ok) {
            streamingSessionActiveRef.current = true;
            streamingPttDebugLog("streaming_ptt_start ok");
            resolve(true);
            return;
          }
          streamingPttDebugLog("streaming_ptt_start failed", {
            message: response?.message,
          });
          if (response?.message && isLocalStreamingSpeaker()) {
            setErrorMessage(response.message);
          }
          resolve(false);
        },
      );
    });
  }, [isLocalStreamingSpeaker, isStreamingPttClientEnabled]);

  const sendStreamingAudioChunk = useCallback(
    (audioBase64: string, format: string) => {
      const socket = socketRef.current;
      if (
        !socket?.connected ||
        !isStreamingPttClientEnabled() ||
        !isLocalStreamingSpeaker() ||
        !streamingSessionActiveRef.current
      ) {
        return;
      }

      streamingChunkCountRef.current += 1;
      if (
        streamingChunkCountRef.current === 1 ||
        streamingChunkCountRef.current % 20 === 0
      ) {
        streamingPttDebugLog("streaming_audio_chunk", {
          n: streamingChunkCountRef.current,
          sessionActive: streamingSessionActiveRef.current,
        });
      }

      socket.emit("streaming_audio_chunk", {
        audioBase64,
        format,
      });
    },
    [isLocalStreamingSpeaker, isStreamingPttClientEnabled],
  );

  const stopStreamingPtt = useCallback(
    (
      audioBase64: string,
      format: string,
      recordingDurationMs: number,
      recordingStartedAt?: number,
    ): Promise<boolean> => {
      return new Promise((resolve) => {
        const socket = socketRef.current;
        if (!socket?.connected || !isStreamingPttClientEnabled()) {
          resolve(false);
          return;
        }

        pendingSpeechMsRef.current = Math.max(
          0,
          Math.round(recordingDurationMs),
        );

        if (!streamingSessionActiveRef.current) {
          streamingPttDebugLog("stop batch fallback (no streaming session)", {
            chunks: streamingChunkCountRef.current,
          });
          resolve(
            sendAudioChunk(
              audioBase64,
              format,
              pendingSpeechMsRef.current,
              recordingStartedAt,
            ),
          );
          return;
        }

        streamingPttDebugLog("streaming_ptt_stop emit", {
          chunks: streamingChunkCountRef.current,
          durationMs: pendingSpeechMsRef.current,
        });
        streamingSessionActiveRef.current = false;

        socket.emit(
          "streaming_ptt_stop",
          {
            audioBase64,
            format,
            recordingDurationMs: pendingSpeechMsRef.current,
            recordingStartedAt,
          },
          (response?: { ok?: boolean; message?: string }) => {
            if (response?.ok) {
              streamingPttDebugLog("streaming_ptt_stop ok");
              resolve(true);
              return;
            }
            streamingPttDebugLog("streaming_ptt_stop failed, batch fallback", {
              message: response?.message,
            });
            const submitted = sendAudioChunk(
              audioBase64,
              format,
              pendingSpeechMsRef.current,
              recordingStartedAt,
            );
            if (response?.message) {
              setErrorMessage(response.message);
            }
            resolve(submitted);
          },
        );
      });
    },
    [isStreamingPttClientEnabled, sendAudioChunk],
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
      const serverStreaming = payload.streamingPttEnabled === true;
      setServerStreamingPttEnabled(serverStreaming);
      if (serverStreaming) {
        streamingPttRef.current = true;
      }
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
        if (payload.phase === "waiting") {
          const partial = partnerPartialRef.current;
          if (partial) {
            setTranscript((entries) => {
              const flushed = flushPartnerPartialToTranscript(
                entries,
                transcriptTurnKeysRef.current,
                partial,
              );
              return flushed.entries;
            });
          }
          setPartnerPartial(null);
        }
      },
    );

    const applyPartnerPartial = (payload: PartialTranslationPayload) => {
      if (payload.fromParticipantId === participantIdRef.current) {
        return;
      }
      setPartnerPartialState((current) => {
        const next = mergePartnerPartial(current, payload);
        partnerPartialRef.current = next;
        return next;
      });
    };

    socket.on("partial_transcript", (payload: PartialTranslationPayload) => {
      if (payload.fromParticipantId === participantIdRef.current) {
        return;
      }
      streamingPttDebugLog("partial_transcript received", {
        chars: payload.sourceText?.length ?? 0,
      });
      applyPartnerPartial(payload);
    });

    socket.on("partial_translation", (payload: PartialTranslationPayload) => {
      if (payload.fromParticipantId === participantIdRef.current) {
        return;
      }
      streamingPttDebugLog("partial_translation received", {
        chars: payload.translatedText?.length ?? 0,
      });
      applyPartnerPartial(payload);
    });

    socket.on(
      "partial_translation_audio",
      (payload: {
        audioBase64?: string;
        translatedText?: string;
        fromParticipantId?: string;
        turnId?: string;
        role?: string;
      }) => {
        if (
          !shouldPlayTranslationAudio(participantIdRef.current, {
            kind: "partial_translation_audio",
            fromParticipantId: payload.fromParticipantId,
            turnId: payload.turnId,
            role: payload.role,
            audioBase64: payload.audioBase64,
          })
        ) {
          return;
        }
        onPartialAudioRef.current?.(payload);
      },
    );

    socket.on("translation_transcript", (payload: TranslationTranscriptPayload) => {
      if (payload.fromParticipantId === participantIdRef.current) {
        return;
      }
      setPartnerPartialState((current) => {
        const next = mergePartnerPartial(current, {
          turnId: payload.turnId,
          fromParticipantId: payload.fromParticipantId,
          sourceText: payload.sourceText,
          translatedText: payload.translatedText,
        });
        partnerPartialRef.current = next;
        return next;
      });
      setTranscript((entries) => {
        const next = appendTranscriptIfNew(
          entries,
          transcriptTurnKeysRef.current,
          "received",
          payload,
          payload.transcriptLatencyMs ?? 0,
        );
        return next.entries;
      });
    });

    socket.on(
      "translation_sent_transcript",
      (payload: TranslationTranscriptPayload) => {
        setTranscript((entries) => {
          const next = appendTranscriptIfNew(
            entries,
            transcriptTurnKeysRef.current,
            "sent",
            payload,
            payload.transcriptLatencyMs ?? 0,
          );
          return next.entries;
        });
      },
    );

    socket.on("translation_result", (payload: TranslationResult) => {
      setPartnerPartial(null);
      setLastReceived(payload);
      setTranscript((entries) => {
        const next = applyTranslationResultToTranscript(
          entries,
          transcriptTurnKeysRef.current,
          payload,
        );
        return next.entries;
      });
      applyTurnUsage(payload, "received");
      if (
        shouldPlayTranslationAudio(participantIdRef.current, {
          kind: "translation_result",
          fromParticipantId: payload.fromParticipantId,
          turnId: payload.turnId,
          audioBase64: payload.audioBase64,
          skippedTts: payload.skippedTts,
        })
      ) {
        onIncomingRef.current?.(payload);
      }
    });

    socket.on("translation_sent", (payload: TranslationResult) => {
      setLastSent(payload);
      setTranscript((entries) => {
        const next = applyTranslationSentToTranscript(
          entries,
          transcriptTurnKeysRef.current,
          payload,
        );
        return next.entries;
      });
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
      const message = payload.message ?? "Unknown socket error";
      if (
        isLiveTranscriptionUnavailableMessage(message) &&
        !isLocalStreamingSpeakerTurn(
          participantIdRef.current,
          turnStateRef.current.turnParticipantId,
          turnStateRef.current.phase,
        )
      ) {
        return;
      }
      setErrorMessage(message);
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
  }, [
    emitJoinRoom,
    elevenlabsVoiceId,
    myLang,
    playTranslatedVoice,
    speakerGender,
    streamingPtt,
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
    partnerPartial,
    serverStreamingPttEnabled,
    totalActiveConversationMs: displayTotalActiveConversationMs,
    myBillableMs,
    partnerBillableMs,
    sessionStartedAt,
    disconnect,
    claimTurn,
    releaseTurn,
    sendAudioChunk,
    startStreamingPtt,
    sendStreamingAudioChunk,
    stopStreamingPtt,
    setErrorMessage,
  };
};
