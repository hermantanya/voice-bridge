import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { languageLabel, type LanguageCode } from "../config";
import type { TranslationResult } from "../hooks/useSocket";

type SessionScreenProps = {
  roomCode: string;
  speakLang: LanguageCode;
  hearLang: LanguageCode;
  status: "connecting" | "connected" | "disconnected" | "error";
  participants: number;
  participantId: string | null;
  errorMessage: string | null;
  isRecording: boolean;
  isTranslating: boolean;
  lastSent: TranslationResult | null;
  lastReceived: TranslationResult | null;
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
  speakLang,
  hearLang,
  status,
  participants,
  participantId,
  errorMessage,
  isRecording,
  isTranslating,
  lastSent,
  lastReceived,
  onStartRecording,
  onStopRecording,
  onLeave,
}: SessionScreenProps) {
  const [recordError, setRecordError] = useState<string | null>(null);
  const canTalk =
    status === "connected" && participants > 1 && !isTranslating && Platform.OS !== "web";

  useEffect(() => {
    setRecordError(null);
  }, [errorMessage]);

  const handlePressIn = async () => {
    if (!canTalk) {
      return;
    }

    try {
      setRecordError(null);
      await onStartRecording();
    } catch (error) {
      setRecordError(
        error instanceof Error ? error.message : "Could not start recording",
      );
    }
  };

  const handlePressOut = async () => {
    if (!isRecording) {
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
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Session</Text>

      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, { backgroundColor: statusColor(status) }]}
            />
            <Text style={styles.value}>{statusLabel(status)}</Text>
          </View>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Room</Text>
          <Text style={styles.roomCode}>{roomCode}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Participants</Text>
          <Text style={styles.value}>{participants}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>I speak</Text>
          <Text style={styles.value}>{languageLabel(speakLang)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>I hear</Text>
          <Text style={styles.value}>{languageLabel(hearLang)}</Text>
        </View>

        {participantId ? (
          <Text style={styles.meta}>Your ID: {participantId.slice(0, 8)}...</Text>
        ) : null}
      </View>

      {Platform.OS === "web" ? (
        <Text style={styles.hint}>
          Use your phone for push-to-talk. This browser view will receive
          translations and play them automatically.
        </Text>
      ) : participants < 2 ? (
        <Text style={styles.hint}>
          Waiting for a second participant to join before you can talk.
        </Text>
      ) : (
        <Text style={styles.hint}>
          Hold the button, speak in {languageLabel(speakLang)}, then release.
          The other person hears {languageLabel(hearLang)}.
        </Text>
      )}

      <Pressable
        style={[
          styles.talkButton,
          isRecording && styles.talkButtonActive,
          !canTalk && styles.talkButtonDisabled,
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!canTalk}
      >
        {isTranslating ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.talkButtonText}>
            {isRecording ? "Listening..." : "Hold to talk"}
          </Text>
        )}
      </Pressable>

      {(lastSent || lastReceived) && (
        <View style={styles.transcriptCard}>
          <Text style={styles.transcriptTitle}>Transcript</Text>

          {lastSent ? (
            <View style={styles.transcriptBlock}>
              <Text style={styles.transcriptLabel}>You said</Text>
              <Text style={styles.transcriptText}>{lastSent.sourceText}</Text>
              <Text style={styles.transcriptLabel}>Translated to</Text>
              <Text style={styles.transcriptTranslated}>
                {lastSent.translatedText}
              </Text>
              <Text style={styles.latency}>{lastSent.latencyMs}ms</Text>
            </View>
          ) : null}

          {lastReceived ? (
            <View style={styles.transcriptBlock}>
              <Text style={styles.transcriptLabel}>They said</Text>
              <Text style={styles.transcriptText}>{lastReceived.sourceText}</Text>
              <Text style={styles.transcriptLabel}>You hear</Text>
              <Text style={styles.transcriptTranslated}>
                {lastReceived.translatedText}
              </Text>
              <Text style={styles.latency}>{lastReceived.latencyMs}ms</Text>
            </View>
          ) : null}
        </View>
      )}

      {recordError ? <Text style={styles.error}>{recordError}</Text> : null}
      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

      <Pressable style={styles.leaveButton} onPress={onLeave}>
        <Text style={styles.leaveButtonText}>Leave session</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    paddingTop: 64,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 20,
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
    fontSize: 14,
    lineHeight: 20,
    marginTop: 20,
  },
  talkButton: {
    marginTop: 20,
    backgroundColor: "#3b82f6",
    borderRadius: 999,
    paddingVertical: 28,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 88,
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
  transcriptCard: {
    marginTop: 20,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 16,
  },
  transcriptTitle: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
  },
  transcriptBlock: {
    gap: 6,
  },
  transcriptLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  transcriptText: {
    color: "#e2e8f0",
    fontSize: 16,
  },
  transcriptTranslated: {
    color: "#60a5fa",
    fontSize: 18,
    fontWeight: "600",
  },
  latency: {
    color: "#64748b",
    fontSize: 12,
    marginTop: 4,
  },
  error: {
    color: "#f87171",
    fontSize: 14,
    marginTop: 12,
  },
  leaveButton: {
    marginTop: 24,
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
