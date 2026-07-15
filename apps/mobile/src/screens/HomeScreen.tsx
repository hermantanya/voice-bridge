import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

type HomeScreenProps = {
  roomCode: string;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenSettings: () => void;
};

export function HomeScreen({
  roomCode,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
}: HomeScreenProps) {
  const trimmedCode = roomCode.trim();
  const canJoin = trimmedCode.length >= 4;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Voice Bridge</Text>
      <Text style={styles.subtitle}>
        Real-time voice translation between two phones
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Room code</Text>
        <Text style={styles.hint}>
          To join an existing room, type the code from the other phone below.
        </Text>
        <TextInput
          style={styles.input}
          value={roomCode}
          onChangeText={onRoomCodeChange}
          placeholder="e.g. T8S4YN"
          placeholderTextColor="#475569"
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={6}
        />

        <Pressable
          style={[styles.secondaryButton, !canJoin && styles.buttonDisabled]}
          onPress={onJoinRoom}
          disabled={!canJoin}
        >
          <Text style={styles.secondaryButtonText}>Join room</Text>
        </Pressable>

        <Text style={styles.orDivider}>or</Text>

        <Pressable style={styles.primaryButton} onPress={onCreateRoom}>
          <Text style={styles.primaryButtonText}>Create new room</Text>
        </Pressable>
      </View>

      <Pressable style={styles.linkButton} onPress={onOpenSettings}>
        <Text style={styles.linkButtonText}>Language settings</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    justifyContent: "center",
  },
  title: {
    color: "#f8fafc",
    fontSize: 32,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 16,
    marginBottom: 32,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  label: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  hint: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  orDivider: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 24,
    letterSpacing: 4,
    textAlign: "center",
  },
  primaryButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: "#334155",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  linkButton: {
    marginTop: 24,
    alignItems: "center",
  },
  linkButtonText: {
    color: "#60a5fa",
    fontSize: 16,
  },
});
