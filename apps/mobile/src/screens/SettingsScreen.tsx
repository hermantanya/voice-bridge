import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { previewEnrolledVoice } from "../api/enrollVoice";
import {
  CONVERSATION_MODES,
  LANGUAGES,
  SPEAKER_GENDERS,
  type ConversationMode,
  type LanguageCode,
  type SpeakerGender,
} from "../config";
import { isHandsFreeComingSoon } from "../session/conversationMode";
import { voiceProfileLabel, type VoiceProfileStatus } from "../session/appState";
import { playVoicePreviewAudio } from "../session/voicePreviewPlayback";
import { isRemotePhoneMic, type MicrophoneDevice } from "../web/microphoneDevices";

type SettingsScreenProps = {
  myLang: LanguageCode;
  speakerGender: SpeakerGender;
  conversationMode: ConversationMode;
  playTranslatedVoice: boolean;
  onCommitProfileSettings?: (settings: {
    hearLang: LanguageCode;
    speakerGender: SpeakerGender;
    conversationMode: ConversationMode;
    playTranslatedVoice: boolean;
  }) => void;
  voiceStatus: VoiceProfileStatus;
  elevenlabsVoiceId?: string | null;
  onOpenVoiceSetup: () => void;
  onRemoveVoice: () => Promise<void>;
  onBack: () => void;
  showMicrophoneSettings?: boolean;
  microphoneDevices?: MicrophoneDevice[];
  selectedMicrophoneId?: string | null;
  onMicrophoneChange?: (deviceId: string) => void;
  onRefreshMicrophones?: (requestLabels?: boolean) => void;
  signedInEmail?: string | null;
  authBusy?: boolean;
  authError?: string | null;
  onSignOut?: () => Promise<void>;
  onClearAuthError?: () => void;
  onOpenSignIn?: () => void;
  onOpenCreateAccount?: () => void;
};

export function SettingsScreen({
  myLang,
  speakerGender,
  conversationMode,
  playTranslatedVoice,
  onCommitProfileSettings,
  voiceStatus,
  elevenlabsVoiceId,
  onOpenVoiceSetup,
  onRemoveVoice,
  onBack,
  showMicrophoneSettings = false,
  microphoneDevices = [],
  selectedMicrophoneId = null,
  onMicrophoneChange,
  onRefreshMicrophones,
  signedInEmail = null,
  authBusy = false,
  authError = null,
  onSignOut,
  onClearAuthError,
  onOpenSignIn,
  onOpenCreateAccount,
}: SettingsScreenProps) {
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [draftLang, setDraftLang] = useState(myLang);
  const [draftGender, setDraftGender] = useState(speakerGender);
  const [draftConversationMode, setDraftConversationMode] =
    useState(conversationMode);
  const [draftPlayTranslatedVoice, setDraftPlayTranslatedVoice] = useState(
    playTranslatedVoice,
  );
  const [draftMicrophoneId, setDraftMicrophoneId] = useState<string | null>(
    selectedMicrophoneId,
  );
  const syncedProfileRef = useRef({
    myLang,
    speakerGender,
    conversationMode,
    playTranslatedVoice,
  });

  useEffect(() => {
    const prev = syncedProfileRef.current;
    setDraftLang((draft) => (draft === prev.myLang ? myLang : draft));
    setDraftGender((draft) =>
      draft === prev.speakerGender ? speakerGender : draft,
    );
    setDraftConversationMode((draft) =>
      draft === prev.conversationMode ? conversationMode : draft,
    );
    setDraftPlayTranslatedVoice((draft) =>
      draft === prev.playTranslatedVoice ? playTranslatedVoice : draft,
    );
    syncedProfileRef.current = {
      myLang,
      speakerGender,
      conversationMode,
      playTranslatedVoice,
    };
  }, [conversationMode, myLang, playTranslatedVoice, speakerGender]);

  useEffect(() => {
    setPreviewText(null);
    setPreviewError(null);
  }, [elevenlabsVoiceId, draftLang, draftGender]);

  const handleSaveAndBack = () => {
    if (
      draftLang !== myLang ||
      draftGender !== speakerGender ||
      draftConversationMode !== conversationMode ||
      draftPlayTranslatedVoice !== playTranslatedVoice
    ) {
      onCommitProfileSettings?.({
        hearLang: draftLang,
        speakerGender: draftGender,
        conversationMode: draftConversationMode,
        playTranslatedVoice: draftPlayTranslatedVoice,
      });
    }
    if (
      showMicrophoneSettings &&
      draftMicrophoneId &&
      draftMicrophoneId !== selectedMicrophoneId
    ) {
      onMicrophoneChange?.(draftMicrophoneId);
    }
    onBack();
  };

  const handleDiscardAndBack = () => {
    onClearAuthError?.();
    onBack();
  };
  useEffect(() => {
    if (showMicrophoneSettings) {
      onRefreshMicrophones?.(true);
    }
  }, [onRefreshMicrophones, showMicrophoneSettings]);

  const content = (
    <>
      <Text style={styles.title}>Account</Text>
      <Text style={styles.subtitle}>
        {signedInEmail
          ? "Your Translate to, gender, and voice sync across devices signed in with this email."
          : "Create an account to sync settings across devices. Guest mode keeps language and voice on this device only."}
      </Text>

      <View style={styles.card}>
        {signedInEmail ? (
          <>
            <Text style={styles.statusTitle}>Signed in</Text>
            <Text style={styles.statusHint}>{signedInEmail}</Text>
            <Pressable
              style={styles.secondaryButton}
              disabled={authBusy}
              onPress={() => {
                void onSignOut?.();
              }}
            >
              <Text style={styles.secondaryButtonText}>Sign out</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              style={styles.setupButton}
              disabled={!onOpenSignIn}
              onPress={() => onOpenSignIn?.()}
            >
              <Text style={styles.setupButtonText}>Sign in</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              disabled={!onOpenCreateAccount}
              onPress={() => onOpenCreateAccount?.()}
            >
              <Text style={styles.secondaryButtonText}>Create account</Text>
            </Pressable>
          </>
        )}
        {authError && !signedInEmail ? (
          <Text style={styles.previewError}>{authError}</Text>
        ) : null}
      </View>

      <Text style={styles.title}>Translate to</Text>
      <Text style={styles.subtitle}>
        Translations you receive will be in this language. Changes apply when
        you tap Save and go back.
      </Text>

      <View style={styles.card}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === draftLang;
          return (
            <Pressable
              key={lang.code}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setDraftLang(lang.code)}
            >
              <Text style={[styles.optionText, active && styles.optionTextActive]}>
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.title, styles.sectionTitle]}>Conversation mode</Text>
      <Text style={styles.subtitle}>
        How you speak in a session. Push-to-talk is available now; hands-free
        will listen automatically when it ships.
      </Text>

      <View style={styles.card}>
        {CONVERSATION_MODES.map((option) => {
          const active = option.value === draftConversationMode;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setDraftConversationMode(option.value)}
            >
              <View style={styles.conversationOptionRow}>
                <Text
                  style={[
                    styles.optionText,
                    active && styles.optionTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {option.value === "hands_free" ? (
                  <Text style={styles.comingSoonBadge}>Coming soon</Text>
                ) : null}
              </View>
              <Text
                style={[
                  styles.conversationOptionDescription,
                  active && styles.conversationOptionDescriptionActive,
                ]}
              >
                {option.description}
              </Text>
            </Pressable>
          );
        })}
        {isHandsFreeComingSoon(draftConversationMode) ? (
          <Text style={styles.conversationModeNote}>
            Sessions still use push-to-talk until hands-free is enabled on this
            device.
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, styles.sectionTitle]}>Incoming translations</Text>
      <Text style={styles.subtitle}>
        Choose whether you hear translated speech from your partner or read the
        transcript only. Transcript-only is faster when you do not need audio.
      </Text>

      <View style={styles.card}>
        {[
          {
            value: true,
            label: "Play translated voice",
            description: "Hear cloned or preset voice when your partner speaks.",
          },
          {
            value: false,
            label: "Transcript only",
            description: "Show text as soon as translation finishes; skip TTS.",
          },
        ].map((option) => {
          const active = option.value === draftPlayTranslatedVoice;
          return (
            <Pressable
              key={option.label}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setDraftPlayTranslatedVoice(option.value)}
            >
              <Text
                style={[styles.optionText, active && styles.optionTextActive]}
              >
                {option.label}
              </Text>
              <Text
                style={[
                  styles.conversationOptionDescription,
                  active && styles.conversationOptionDescriptionActive,
                ]}
              >
                {option.description}
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
          const active = option.value === draftGender;
          return (
            <Pressable
              key={option.value}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => setDraftGender(option.value)}
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
        preset.
        {signedInEmail
          ? " Syncs to your account across devices."
          : " Saved on this device until you create an account or remove it."}
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
          <>
            <Pressable
              style={styles.secondaryButton}
              disabled={previewLoading || !elevenlabsVoiceId}
              onPress={() => {
                if (!elevenlabsVoiceId) {
                  return;
                }

                void (async () => {
                  try {
                    setPreviewLoading(true);
                    setPreviewError(null);
                    const result = await previewEnrolledVoice({
                      voiceId: elevenlabsVoiceId,
                      language: draftLang,
                      gender: draftGender,
                    });
                    setPreviewText(result.previewText);
                    await playVoicePreviewAudio(result.previewAudioBase64);
                  } catch (error) {
                    setPreviewError(
                      error instanceof Error
                        ? error.message
                        : "Could not play voice preview",
                    );
                  } finally {
                    setPreviewLoading(false);
                  }
                })();
              }}
            >
              {previewLoading ? (
                <View style={styles.previewLoadingRow}>
                  <ActivityIndicator color="#93c5fd" size="small" />
                  <Text style={styles.secondaryButtonText}>Loading preview…</Text>
                </View>
              ) : (
                <Text style={styles.secondaryButtonText}>Play voice preview</Text>
              )}
            </Pressable>
            {previewText ? (
              <Text style={styles.previewText}>{previewText}</Text>
            ) : null}
            {previewError ? (
              <Text style={styles.previewError}>{previewError}</Text>
            ) : null}
            <Pressable
              style={styles.removeButton}
              onPress={() => {
                void onRemoveVoice();
              }}
            >
              <Text style={styles.removeButtonText}>Remove my voice</Text>
            </Pressable>
          </>
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
                const active = device.deviceId === draftMicrophoneId;
                return (
                  <Pressable
                    key={device.deviceId}
                    style={[styles.option, active && styles.optionActive]}
                    onPress={() => setDraftMicrophoneId(device.deviceId)}
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
          After saving language or gender, leave and rejoin the room so your
          partner gets the update. Voice changes apply immediately.
        </Text>
      </View>

      <View style={styles.footerActions}>
        <Pressable style={styles.discardBackButton} onPress={handleDiscardAndBack}>
          <Text style={styles.discardBackButtonText}>Back</Text>
        </Pressable>
        <Pressable style={styles.saveBackButton} onPress={handleSaveAndBack}>
          <Text style={styles.saveBackButtonText}>Save and go back</Text>
        </Pressable>
      </View>
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
  conversationOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  conversationOptionDescription: {
    marginTop: 6,
    color: "#64748b",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  conversationOptionDescriptionActive: {
    color: "#dbeafe",
  },
  comingSoonBadge: {
    color: "#fcd34d",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  conversationModeNote: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
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
  secondaryButton: {
    backgroundColor: "#0f172a",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
  },
  secondaryButtonText: {
    color: "#93c5fd",
    fontSize: 16,
    fontWeight: "600",
  },
  previewLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewText: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  previewError: {
    color: "#fca5a5",
    fontSize: 14,
    lineHeight: 20,
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
  footerActions: {
    marginTop: 24,
    gap: 12,
  },
  discardBackButton: {
    backgroundColor: "#1e293b",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#475569",
    paddingVertical: 14,
    alignItems: "center",
  },
  discardBackButtonText: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
  },
  saveBackButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBackButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
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
});
