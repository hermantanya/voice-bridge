import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type WelcomeScreenProps = {
  onSignIn: () => void;
  onCreateAccount: () => void;
  onGuestMode: () => void;
};

export function WelcomeScreen({
  onSignIn,
  onCreateAccount,
  onGuestMode,
}: WelcomeScreenProps) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.container}>
        <Text style={styles.title}>Voice Bridge</Text>
        <Text style={styles.subtitle}>
          Real-time voice translation in English, Hebrew, or Russian
        </Text>

        <View style={styles.actions}>
          <Pressable style={styles.primaryButton} onPress={onSignIn}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={onCreateAccount}>
            <Text style={styles.secondaryButtonText}>Create account</Text>
          </Pressable>

          <Pressable style={styles.textButton} onPress={onGuestMode}>
            <Text style={styles.textButtonText}>Guest mode</Text>
          </Pressable>

          <Text style={styles.guestHint}>
            Guest mode saves language and voice on this device only. Create an
            account to sync across devices.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 48,
  },
  container: {
    flex: 1,
    padding: 24,
    justifyContent: "center",
    minHeight: "100%",
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
    lineHeight: 22,
    marginBottom: 32,
  },
  actions: {
    gap: 12,
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
  textButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  textButtonText: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "600",
  },
  guestHint: {
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginTop: 8,
  },
});
