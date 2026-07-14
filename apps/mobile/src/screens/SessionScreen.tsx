import { Pressable, StyleSheet, Text, View } from "react-native";

import { languageLabel, type LanguageCode } from "../config";

type SessionScreenProps = {
  roomCode: string;
  speakLang: LanguageCode;
  hearLang: LanguageCode;
  status: "connecting" | "connected" | "disconnected" | "error";
  participants: number;
  participantId: string | null;
  errorMessage: string | null;
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
  onLeave,
}: SessionScreenProps) {
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

        {errorMessage ? (
          <Text style={styles.error}>{errorMessage}</Text>
        ) : null}
      </View>

      <Text style={styles.hint}>
        Audio controls arrive in Step 4. For now, confirm this screen shows
        Connected once you join a room.
      </Text>

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
  error: {
    color: "#f87171",
    fontSize: 14,
  },
  hint: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 20,
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
