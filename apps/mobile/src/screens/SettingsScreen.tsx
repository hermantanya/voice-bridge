import { useEffect } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  LANGUAGES,
  SPEAKER_GENDERS,
  type LanguageCode,
  type SpeakerGender,
} from "../config";
import { voiceProfileLabel, type VoiceProfileStatus } from "../session/appState";
import { isRemotePhoneMic, type MicrophoneDevice } from "../web/microphoneDevices";

type SettingsScreenProps = {
  myLang: LanguageCode;
  onMyLangChange: (lang: LanguageCode) => void;
  speakerGender: SpeakerGender;
  onSpeakerGenderChange: (gender: SpeakerGender) => void;
  voiceStatus: VoiceProfileStatus;
  onOpenVoiceSetup: () => void;
  onRemoveVoice: () => Promise<void>;
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
  speakerGender,
  onSpeakerGenderChange,
  voiceStatus,
  onOpenVoiceSetup,
  onRemoveVoice,
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

  const content = (
    <>
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

      <Text style={[styles.title, styles.sectionTitle]}>My gender</Text>
      <Text style={styles.subtitle}>
        Used for Hebrew and Russian grammar on both sides: when you speak and
        when your partner speaks to you. Each person sets their own gender in
        settings.
      </Text>

      <View style={styles.card}>
        {SPEAKER_GENDERS.map((option) => {
          const active = option.value === speakerGender;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onSpeakerGenderChange(option.value)}
            >
              <Text
                style={[styles.optionText, active && styles.optionTextActive]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.title, styles.sectionTitle]}>My voice</Text>
      <Text style={styles.subtitle}>
        Enroll once so your partner hears translations in your voice, not a
        preset. Stored on this device until you remove it.
      </Text>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              voiceStatus === "custom"
                ? styles.statusDotReady
                : styles.statusDotDefault,
            ]}
          />
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{voiceProfileLabel(voiceStatus)}</Text>
            <Text style={styles.statusHint}>
              {voiceStatus === "custom"
                ? "Partners hear your enrolled voice when you speak."
                : "Partners hear a preset voice until you set up yours."}
            </Text>
          </View>
        </View>

        <Pressable style={styles.setupButton} onPress={onOpenVoiceSetup}>
          <Text style={styles.setupButtonText}>
            {voiceStatus === "custom" ? "Re-enroll my voice" : "Set up my voice"}
          </Text>
        </Pressable>

        {voiceStatus === "custom" ? (
          <Pressable
            style={styles.removeButton}
            onPress={() => {
              void onRemoveVoice();
            }}
          >
            <Text style={styles.removeButtonText}>Remove my voice</Text>
          </Pressable>
        ) : null}
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
          Leave and rejoin the room after changing language, gender, or voice.
        </Text>
      </View>

      <Pressable style={styles.backButton} onPress={onBack}>
        <Text style={styles.backButtonText}>Save and go back</Text>
      </Pressable>
    </>
  );

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator
    >
      {content}
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
    padding: 24,
    paddingTop: 64,
    paddingBottom: 48,
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
  statusRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
    flexShrink: 0,
  },
  statusDotReady: {
    backgroundColor: "#34d399",
  },
  statusDotDefault: {
    backgroundColor: "#64748b",
  },
  statusCopy: {
    flex: 1,
    gap: 4,
  },
  statusTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "600",
  },
  statusHint: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
  },
  setupButton: {
    marginTop: 8,
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  setupButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  removeButton: {
    paddingVertical: 10,
    alignItems: "center",
  },
  removeButtonText: {
    color: "#fca5a5",
    fontSize: 14,
    fontWeight: "600",
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
