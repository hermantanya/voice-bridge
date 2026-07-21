import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { TranscriptPanel } from "../components/TranscriptPanel";
import { languageLabel, type LanguageCode } from "../config";
import type { TranscriptEntry } from "../hooks/useSocket";
import { formatActiveConversationDuration, formatSessionDuration } from "../utils/timeFormat";

type SessionScreenProps = {
  roomCode: string;
  myLang: LanguageCode;
  partnerLang: LanguageCode | null;
  status: "connecting" | "connected" | "disconnected" | "error";
  participants: number;
  participantId: string | null;
  errorMessage: string | null;
  isRecording: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
  isProcessing: boolean;
  transcript: TranscriptEntry[];
  totalActiveConversationMs: number;
  myBillableMs: number;
  sessionStartedAt: number | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onLeave: () => void;
};

function statusColor(status: SessionScreenProps["status"]): string {
  switch (status) {
    case "connected":
      return "#22c55e";
    case "connecting":
      return "#eab308";
    case "error":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

function statusLabel(status: SessionScreenProps["status"]): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting...";
    case "error":
      return "Connection error";
    default:
      return "Disconnected";
  }
}

export function SessionScreen({
  roomCode,
  myLang,
  partnerLang,
  status,
  participants,
  errorMessage,
  isRecording,
  isMyTurn,
  isOpenTurn,
  isProcessing,
  transcript,
  totalActiveConversationMs,
  myBillableMs,
  sessionStartedAt,
  onStartRecording,
  onStopRecording,
  onLeave,
}: SessionScreenProps) {
  const [recordError, setRecordError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const holdingRef = useRef(false);
  const canTalk =
    status === "connected" &&
    participants > 1 &&
    !isProcessing &&
    !isRecording &&
    (isOpenTurn || isMyTurn);

  const turnLabel = (() => {
    if (participants < 2) {
      return "Waiting for partner";
    }
    if (isProcessing) {
      return "Translating...";
    }
    if (isMyTurn) {
      return "You're speaking";
    }
    if (isOpenTurn) {
      return "Ready: hold to talk";
    }
    return "Partner is speaking";
  })();

  const turnColor = (() => {
    if (isProcessing) {
      return "#eab308";
    }
    if (isMyTurn) {
      return "#22c55e";
    }
    if (isOpenTurn) {
      return "#60a5fa";
    }
    return "#64748b";
  })();

  useEffect(() => {
    setRecordError(null);
  }, [errorMessage]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const stopTalking = useCallback(async () => {
    const wasHolding = holdingRef.current;
    holdingRef.current = false;

    if (!wasHolding && !isRecording) {
      return;
    }

    try {
      setRecordError(null);
      await onStopRecording();
    } catch (error) {
      setRecordError(
        error instanceof Error ? error.message : "Could not stop recording",
      );
    }
  }, [isRecording, onStopRecording]);

  const handleTalkStart = async () => {
    if (!canTalk || holdingRef.current || isRecording) {
      return;
    }

    holdingRef.current = true;

    try {
      setRecordError(null);
      await onStartRecording();
    } catch (error) {
      holdingRef.current = false;
      setRecordError(
        error instanceof Error ? error.message : "Could not start recording",
      );
    }
  };

  const handleTalkEnd = () => {
    void stopTalking();
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handleGlobalRelease = () => {
      void stopTalking();
    };

    document.addEventListener("pointerup", handleGlobalRelease, true);
    document.addEventListener("pointercancel", handleGlobalRelease, true);

    return () => {
      document.removeEventListener("pointerup", handleGlobalRelease, true);
      document.removeEventListener("pointercancel", handleGlobalRelease, true);
    };
  }, [stopTalking]);

  const showSessionStats = participants >= 2;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Session</Text>
        <Text style={styles.roomCodeInline}>{roomCode}</Text>
        {showSessionStats ? (
          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Session duration</Text>
              <Text style={styles.statValue}>
                {sessionStartedAt
                  ? formatSessionDuration(sessionStartedAt, nowMs)
                  : "0:00"}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Active conversation time</Text>
              <Text style={styles.statValue}>
                {formatActiveConversationDuration(totalActiveConversationMs)}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>My active conversation time</Text>
              <Text style={styles.statValueHighlight}>
                {formatActiveConversationDuration(myBillableMs)}
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.compactCard}>
        <View style={styles.compactRow}>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor(status) }]}
            />
            <Text style={styles.compactValue}>{statusLabel(status)}</Text>
          </View>
          <Text style={styles.compactMeta}>
            {participants} participant{participants === 1 ? "" : "s"}
          </Text>
        </View>
        <Text style={styles.compactMeta}>
          You: {languageLabel(myLang)}
          {partnerLang ? ` · Partner: ${languageLabel(partnerLang)}` : ""}
        </Text>
      </View>

      <View style={[styles.turnCard, { borderColor: turnColor }]}>
        <View style={[styles.turnDot, { backgroundColor: turnColor }]} />
        <Text style={[styles.turnText, { color: turnColor }]}>{turnLabel}</Text>
      </View>

      {participants < 2 ? (
        <Text style={styles.hint}>Waiting for a second participant to join.</Text>
      ) : isMyTurn || isOpenTurn ? (
        <Text style={styles.hint} numberOfLines={2}>
          Hold to talk in {languageLabel(myLang)}.
          {Platform.OS === "web"
            ? " Pick Mac mic in Language settings."
            : ""}
        </Text>
      ) : isProcessing ? (
        <Text style={styles.hint}>Translating...</Text>
      ) : (
        <Text style={styles.hint}>Partner is speaking.</Text>
      )}

      <TranscriptPanel entries={transcript} />

      <View style={styles.footer}>
        <Pressable
          style={[
            styles.talkButton,
            isRecording && styles.talkButtonActive,
            !canTalk && !isRecording && styles.talkButtonDisabled,
          ]}
          onPressIn={Platform.OS === "web" ? undefined : handleTalkStart}
          onPressOut={Platform.OS === "web" ? undefined : handleTalkEnd}
          onPointerDown={Platform.OS === "web" ? () => void handleTalkStart() : undefined}
          onPointerUp={Platform.OS === "web" ? handleTalkEnd : undefined}
          onPointerLeave={Platform.OS === "web" ? handleTalkEnd : undefined}
          disabled={Platform.OS !== "web" && !canTalk && !isRecording}
          accessibilityState={{ disabled: !canTalk && !isRecording }}
        >
          {isProcessing ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.talkButtonText}>
              {isRecording
                ? "Listening..."
                : isMyTurn || isOpenTurn
                  ? "Hold to talk"
                  : "Partner is speaking"}
            </Text>
          )}
        </Pressable>

        {recordError ? <Text style={styles.error}>{recordError}</Text> : null}
        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable style={styles.leaveButton} onPress={onLeave}>
          <Text style={styles.leaveButtonText}>Leave session</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 16,
    gap: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  roomCodeInline: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
  },
  statsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginTop: 4,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  statLabel: {
    flex: 1,
    flexShrink: 1,
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    minWidth: 52,
    textAlign: "right",
  },
  statValueHighlight: {
    color: "#60a5fa",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    minWidth: 52,
    textAlign: "right",
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 12,
    flexGrow: 1,
  },
  compactCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compactValue: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  compactMeta: {
    color: "#94a3b8",
    fontSize: 13,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: "#94a3b8",
    fontSize: 15,
  },
  value: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
  roomCode: {
    color: "#60a5fa",
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  meta: {
    color: "#64748b",
    fontSize: 12,
  },
  hint: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  turnCard: {
    marginBottom: 8,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  turnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  footer: {
    paddingTop: 12,
    gap: 8,
  },
  talkButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 999,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 76,
  },
  talkButtonActive: {
    backgroundColor: "#ef4444",
  },
  talkButtonDisabled: {
    opacity: 0.5,
  },
  talkButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  error: {
    color: "#f87171",
    fontSize: 14,
  },
  leaveButton: {
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  leaveButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
});
