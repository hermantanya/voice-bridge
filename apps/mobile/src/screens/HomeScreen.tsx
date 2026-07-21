import { useCallback } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { languageLabel, type LanguageCode } from "../config";

type HomeScreenProps = {
  roomCode: string;
  myLang: LanguageCode;
  onRoomCodeChange: (value: string) => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
  onOpenSettings: () => void;
};

export function HomeScreen({
  roomCode,
  myLang,
  onRoomCodeChange,
  onCreateRoom,
  onJoinRoom,
  onOpenSettings,
}: HomeScreenProps) {
  const trimmedCode = roomCode.trim();
  const canJoin = trimmedCode.length >= 4;

  const dismissKeyboard = useCallback(() => {
    Keyboard.dismiss();
  }, []);

  const handleCreateRoom = useCallback(() => {
    dismissKeyboard();
    onCreateRoom();
  }, [dismissKeyboard, onCreateRoom]);

  const handleJoinRoom = useCallback(() => {
    dismissKeyboard();
    onJoinRoom();
  }, [dismissKeyboard, onJoinRoom]);

  const handleOpenSettings = useCallback(() => {
    dismissKeyboard();
    onOpenSettings();
  }, [dismissKeyboard, onOpenSettings]);

  const handleClearCode = useCallback(() => {
    onRoomCodeChange("");
    dismissKeyboard();
  }, [dismissKeyboard, onRoomCodeChange]);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.container}>
          <Pressable style={styles.headerArea} onPress={dismissKeyboard}>
            <Text style={styles.title}>Voice Bridge</Text>
            <Text style={styles.subtitle}>
              Real-time voice translation between two devices
            </Text>
          </Pressable>

          <Pressable style={styles.langBadge} onPress={handleOpenSettings}>
            <Text style={styles.langBadgeText}>
              My language: {languageLabel(myLang)}
            </Text>
            <Text style={styles.langBadgeAction}>Change</Text>
          </Pressable>

          <View style={styles.card}>
            <Text style={styles.label}>Room code</Text>
            <Text style={styles.hint}>
              To join an existing room, type the code from the other phone below.
              Or tap Create new room to skip this.
            </Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={roomCode}
                onChangeText={onRoomCodeChange}
                placeholder="e.g. T8S4YN"
                placeholderTextColor="#475569"
                autoCapitalize="characters"
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                maxLength={6}
                returnKeyType="done"
                blurOnSubmit
                onSubmitEditing={dismissKeyboard}
              />
              {roomCode.length > 0 ? (
                <Pressable style={styles.clearButton} onPress={handleClearCode}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </Pressable>
              ) : null}
            </View>

            <Pressable
              style={[
                canJoin ? styles.primaryButton : styles.secondaryButton,
                !canJoin && styles.buttonDisabled,
              ]}
              onPress={handleJoinRoom}
              disabled={!canJoin}
            >
              <Text
                style={
                  canJoin ? styles.primaryButtonText : styles.secondaryButtonText
                }
              >
                Join room
              </Text>
            </Pressable>

            <Text style={styles.orDivider}>or</Text>

            <Pressable
              style={canJoin ? styles.secondaryButton : styles.primaryButton}
              onPress={handleCreateRoom}
            >
              <Text
                style={
                  canJoin ? styles.secondaryButtonText : styles.primaryButtonText
                }
              >
                Create new room
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    padding: 24,
    justifyContent: "center",
    minHeight: "100%",
  },
  headerArea: {
    marginBottom: 16,
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
  },
  langBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#1e293b",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 24,
  },
  langBadgeText: {
    color: "#cbd5e1",
    fontSize: 15,
    fontWeight: "600",
  },
  langBadgeAction: {
    color: "#60a5fa",
    fontSize: 15,
    fontWeight: "600",
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
  inputRow: {
    gap: 8,
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
  clearButton: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  clearButtonText: {
    color: "#60a5fa",
    fontSize: 14,
    fontWeight: "600",
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
});
