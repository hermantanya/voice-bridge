import { useEffect } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { LANGUAGES, languageLabel, type LanguageCode } from "../config";
import { isRemotePhoneMic, type MicrophoneDevice } from "../web/microphoneDevices";

type SettingsScreenProps = {
  myLang: LanguageCode;
  onMyLangChange: (lang: LanguageCode) => void;
  onBack: () => void;
  showMicrophoneSettings?: boolean;
  microphoneDevices?: MicrophoneDevice[];
  selectedMicrophoneId?: string | null;
  onMicrophoneChange?: (deviceId: string) => void;
  onRefreshMicrophones?: (requestLabels?: boolean) => void;
};

export function SettingsScreen({
  myLang,
  onMyLangChange,
  onBack,
  showMicrophoneSettings = false,
  microphoneDevices = [],
  selectedMicrophoneId = null,
  onMicrophoneChange,
  onRefreshMicrophones,
}: SettingsScreenProps) {
  useEffect(() => {
    if (showMicrophoneSettings) {
      onRefreshMicrophones?.(true);
    }
  }, [onRefreshMicrophones, showMicrophoneSettings]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My language</Text>
      <Text style={styles.subtitle}>
        Pick the language you speak. You'll hear the other person in this same
        language.
      </Text>

      <View style={styles.card}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === myLang;
          return (
            <Pressable
              key={lang.code}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onMyLangChange(lang.code)}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {showMicrophoneSettings ? (
        <>
          <Text style={[styles.title, styles.sectionTitle]}>Microphone</Text>
          <Text style={styles.subtitle}>
            On Mac, pick your Mac microphone here. Avoid iPhone or Continuity
            inputs unless you mean to use your phone as the mic.
          </Text>

          <View style={styles.card}>
            {microphoneDevices.length === 0 ? (
              <Text style={styles.exampleText}>
                Allow microphone access in your browser to see available inputs.
              </Text>
            ) : (
              microphoneDevices.map((device) => {
                const active = device.deviceId === selectedMicrophoneId;
                return (
                  <Pressable
                    key={device.deviceId}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => onMicrophoneChange?.(device.deviceId)}
                  >
                    <Text
                      style={[
                        styles.optionText,
                        active && styles.optionTextActive,
                      ]}
                    >
                      {device.label}
                      {isRemotePhoneMic(device.label) ? " (phone)" : ""}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </View>
        </>
      ) : null}

      <View style={styles.exampleCard}>
        <Text style={styles.exampleTitle}>Tip</Text>
        <Text style={styles.exampleText}>
          Each device should use the language spoken on that device.
        </Text>
        <Text style={styles.exampleText}>
          Leave and rejoin the room after changing language.
        </Text>
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Save and go back</Text>
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
    marginBottom: 8,
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionTitle: {
    marginTop: 32,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  option: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  optionActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#3b82f6",
  },
  optionText: {
    color: "#cbd5e1",
    fontSize: 18,
    fontWeight: "600",
  },
  optionTextActive: {
    color: "#ffffff",
  },
  exampleCard: {
    marginTop: 20,
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  exampleTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  exampleText: {
    color: "#94a3b8",
    fontSize: 15,
  },
  backButton: {
    marginTop: 24,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  backButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
});
