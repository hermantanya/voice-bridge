import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export type AuthScreenMode = "sign-in" | "create-account";

type AuthScreenProps = {
  mode: AuthScreenMode;
  authBusy?: boolean;
  authError?: string | null;
  onBack: () => void;
  onClearAuthError?: () => void;
  onRequestOtp?: (email: string) => Promise<{ devCode?: string; message?: string } | null>;
  onVerifyOtp?: (email: string, code: string) => Promise<unknown>;
};

export function AuthScreen({
  mode,
  authBusy = false,
  authError = null,
  onBack,
  onClearAuthError,
  onRequestOtp,
  onVerifyOtp,
}: AuthScreenProps) {
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [authHint, setAuthHint] = useState<string | null>(null);

  const title = mode === "create-account" ? "Create account" : "Sign in";
  const lead =
    mode === "create-account"
      ? "We will email a one-time code. After verify, you can set language, gender, and voice."
      : "We will email a one-time code. No password.";

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.container}>
        <Pressable style={styles.backLink} onPress={onBack}>
          <Text style={styles.backLinkText}>Back</Text>
        </Pressable>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{lead}</Text>

        <View style={styles.card}>
          <TextInput
            style={styles.textInput}
            value={authEmail}
            onChangeText={(value) => {
              setAuthEmail(value);
              onClearAuthError?.();
            }}
            placeholder="Email"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!authBusy && !otpSent}
          />

          {otpSent ? (
            <>
              <TextInput
                style={styles.textInput}
                value={authCode}
                onChangeText={(value) => {
                  setAuthCode(value.replace(/\D/g, "").slice(0, 6));
                  onClearAuthError?.();
                }}
                placeholder="6-digit code"
                placeholderTextColor="#64748b"
                keyboardType="number-pad"
                editable={!authBusy}
              />
              {authHint ? (
                <Text style={styles.statusHint}>{authHint}</Text>
              ) : null}
              <Pressable
                style={styles.primaryButton}
                disabled={
                  authBusy || authCode.length !== 6 || !onVerifyOtp
                }
                onPress={() => {
                  void (async () => {
                    const result = await onVerifyOtp!(
                      authEmail.trim(),
                      authCode,
                    );
                    if (!result) {
                      return;
                    }
                    setOtpSent(false);
                    setAuthCode("");
                    setAuthHint(null);
                  })();
                }}
              >
                {authBusy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.primaryButtonText}>Verify</Text>
                )}
              </Pressable>
            </>
          ) : (
            <Pressable
              style={styles.primaryButton}
              disabled={authBusy || !authEmail.trim() || !onRequestOtp}
              onPress={() => {
                void (async () => {
                  const result = await onRequestOtp!(authEmail.trim());
                  if (!result) {
                    return;
                  }
                  setOtpSent(true);
                  setAuthHint(
                    result.devCode
                      ? `Dev code: ${result.devCode}`
                      : (result.message ?? "Check your email for a code."),
                  );
                })();
              }}
            >
              {authBusy ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.primaryButtonText}>Send sign-in code</Text>
              )}
            </Pressable>
          )}

          {authError ? <Text style={styles.errorText}>{authError}</Text> : null}
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
    paddingTop: 16,
  },
  backLink: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 8,
  },
  backLinkText: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "600",
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 8,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 21,
    marginBottom: 20,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  textInput: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#334155",
    color: "#f8fafc",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  statusHint: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
  },
});
