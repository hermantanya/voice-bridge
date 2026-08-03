import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { enrollVoice } from "../api/enrollVoice";
import { LANGUAGES, type LanguageCode, type SpeakerGender } from "../config";
import { useEnrollmentRecording } from "../hooks/useEnrollmentRecording";
import { playVoicePreviewAudio } from "../session/voicePreviewPlayback";
import {
  enrollmentDurationHint,
  estimatedEnrollmentReadSeconds,
  formatEnrollmentDuration,
  getEnrollmentPrompt,
  hasMinimumEnrollmentDuration,
  MIN_ENROLLMENT_DURATION_MS,
} from "../session/enrollmentPrompts";

type VoiceSetupScreenProps = {
  myLang: LanguageCode;
  speakerGender: SpeakerGender;
  existingVoiceId?: string | null;
  onComplete: (voiceId: string) => Promise<void>;
  onBack: () => void;
};

type SetupPhase =
  | "idle"
  | "recording"
  | "review"
  | "uploading"
  | "success"
  | "error";

async function playPreviewAudio(audioBase64: string) {
  await playVoicePreviewAudio(audioBase64);
}

export function VoiceSetupScreen({
  myLang,
  speakerGender,
  existingVoiceId,
  onComplete,
  onBack,
}: VoiceSetupScreenProps) {
  const [scriptLang, setScriptLang] = useState<LanguageCode>(myLang);
  const prompt = useMemo(
    () => getEnrollmentPrompt(scriptLang, speakerGender),
    [scriptLang, speakerGender],
  );
  const estimatedReadSeconds = useMemo(
    () => estimatedEnrollmentReadSeconds(scriptLang, speakerGender),
    [scriptLang, speakerGender],
  );
  const recorder = useEnrollmentRecording();

  const [phase, setPhase] = useState<SetupPhase>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewAudioBase64, setPreviewAudioBase64] = useState<string | null>(
    null,
  );
  const [enrolledVoiceId, setEnrolledVoiceId] = useState<string | null>(null);
  const [pendingRecording, setPendingRecording] = useState<{
    audioBase64: string;
    format: string;
    durationMs: number;
  } | null>(null);

  const canCreateVoice = hasMinimumEnrollmentDuration(
    pendingRecording?.durationMs ?? recorder.elapsedMs,
  );

  const handleStartRecording = useCallback(async () => {
    try {
      setStatusMessage(null);
      setPendingRecording(null);
      setPhase("recording");
      await recorder.startRecording();
    } catch (error) {
      setPhase("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Could not start recording",
      );
    }
  }, [recorder]);

  const handleStopRecording = useCallback(async () => {
    try {
      const recording = await recorder.stopRecording();
      if (!recording) {
        setPhase("error");
        setStatusMessage("No audio was captured. Try again.");
        return;
      }

      setPendingRecording(recording);

      if (!hasMinimumEnrollmentDuration(recording.durationMs)) {
        setPhase("idle");
        setStatusMessage(
          `Recording stopped at ${Math.ceil(recording.durationMs / 1000)}s. Keep reading until you reach at least ${MIN_ENROLLMENT_DURATION_MS / 1000} seconds, then stop again.`,
        );
        return;
      }

      setPhase("review");
      setStatusMessage("Recording complete. Create your voice when ready.");
    } catch (error) {
      setPhase("error");
      setStatusMessage(
        error instanceof Error ? error.message : "Could not stop recording",
      );
    }
  }, [recorder]);

  const handleCreateVoice = useCallback(async () => {
    if (!pendingRecording) {
      return;
    }

    try {
      setPhase("uploading");
      setStatusMessage("Creating your voice clone…");

      const result = await enrollVoice({
        audioBase64: pendingRecording.audioBase64,
        format: pendingRecording.format,
        language: scriptLang,
        gender: speakerGender,
        durationMs: pendingRecording.durationMs,
        replaceVoiceId: existingVoiceId,
      });

      setEnrolledVoiceId(result.voiceId);
      setPreviewText(result.previewText);
      setPreviewAudioBase64(result.previewAudioBase64);
      setPhase("success");
      setStatusMessage("Voice ready. Play the preview, then save.");
    } catch (error) {
      setPhase("review");
      setStatusMessage(
        error instanceof Error ? error.message : "Voice enrollment failed",
      );
    }
  }, [existingVoiceId, pendingRecording, scriptLang, speakerGender]);

  const handleSave = useCallback(async () => {
    if (!enrolledVoiceId) {
      return;
    }

    await onComplete(enrolledVoiceId);
    onBack();
  }, [enrolledVoiceId, onBack, onComplete]);

  const handlePlayPreview = useCallback(async () => {
    if (!previewAudioBase64) {
      return;
    }

    try {
      await playPreviewAudio(previewAudioBase64);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Could not play preview",
      );
    }
  }, [previewAudioBase64]);

  const handleCancel = useCallback(async () => {
    if (recorder.isRecording) {
      await recorder.stopRecording();
      recorder.resetRecording();
    }
    onBack();
  }, [onBack, recorder]);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Set up my voice</Text>
      <Text style={styles.subtitle}>
        Read all {prompt.paragraphs.length} paragraphs below at a natural pace —
        about {estimatedReadSeconds} seconds. You need at least{" "}
        {MIN_ENROLLMENT_DURATION_MS / 1000} seconds of audio before creating
        your voice clone.
      </Text>

      <Text style={styles.sectionLabel}>Script language</Text>
      <Text style={styles.sectionHint}>
        Defaults to your translate-to language. Change this if you want a
        different script to read.
      </Text>
      <View style={styles.langRow}>
        {LANGUAGES.map((lang) => {
          const active = lang.code === scriptLang;
          return (
            <Pressable
              key={lang.code}
              style={[styles.langOption, active && styles.langOptionActive]}
              onPress={() => setScriptLang(lang.code)}
            >
              <Text
                style={[
                  styles.langOptionText,
                  active && styles.langOptionTextActive,
                ]}
              >
                {lang.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{prompt.title}</Text>
        {prompt.paragraphs.map((paragraph) => (
          <Text key={paragraph} style={styles.promptParagraph}>
            {paragraph}
          </Text>
        ))}
      </View>

      <View style={styles.timerCard}>
        <Text style={styles.timerLabel}>Recording time</Text>
        <Text style={styles.timerValue}>
          {formatEnrollmentDuration(
            pendingRecording?.durationMs ?? recorder.elapsedMs,
          )}
        </Text>
        <Text style={styles.timerHint}>
          {enrollmentDurationHint(
            pendingRecording?.durationMs ?? recorder.elapsedMs,
          )}
        </Text>
      </View>

      {statusMessage ? (
        <Text
          style={[
            styles.statusMessage,
            phase === "error" || (phase === "idle" && statusMessage.includes("Keep reading"))
              ? styles.statusError
              : styles.statusInfo,
          ]}
        >
          {statusMessage}
        </Text>
      ) : null}

      {phase === "uploading" ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color="#60a5fa" />
          <Text style={styles.loadingText}>Uploading enrollment audio…</Text>
        </View>
      ) : null}

      {phase === "success" && previewText ? (
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Preview</Text>
          <Text style={styles.previewText}>{previewText}</Text>
          <Pressable style={styles.secondaryButton} onPress={handlePlayPreview}>
            <Text style={styles.secondaryButtonText}>Play preview</Text>
          </Pressable>
        </View>
      ) : null}

      {phase === "idle" || phase === "error" ? (
        <Pressable style={styles.primaryButton} onPress={handleStartRecording}>
          <Text style={styles.primaryButtonText}>
            {pendingRecording ? "Record again" : existingVoiceId ? "Re-record my voice" : "Start recording"}
          </Text>
        </Pressable>
      ) : null}

      {phase === "recording" ? (
        <Pressable style={styles.primaryButton} onPress={handleStopRecording}>
          <Text style={styles.primaryButtonText}>Stop recording</Text>
        </Pressable>
      ) : null}

      {phase === "review" && pendingRecording ? (
        <>
          <Pressable
            style={[
              styles.primaryButton,
              !canCreateVoice && styles.buttonDisabled,
            ]}
            onPress={handleCreateVoice}
            disabled={!canCreateVoice}
          >
            <Text style={styles.primaryButtonText}>Create my voice</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={handleStartRecording}>
            <Text style={styles.secondaryButtonText}>Record again</Text>
          </Pressable>
        </>
      ) : null}

      {phase === "success" ? (
        <Pressable style={styles.primaryButton} onPress={handleSave}>
          <Text style={styles.primaryButtonText}>Save and go back</Text>
        </Pressable>
      ) : null}

      <Pressable style={styles.backButton} onPress={handleCancel}>
        <Text style={styles.backButtonText}>Cancel</Text>
      </Pressable>
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
    gap: 16,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 15,
    lineHeight: 22,
  },
  sectionLabel: {
    color: "#e2e8f0",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 4,
  },
  sectionHint: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 18,
  },
  langRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  langOption: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  langOptionActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  langOptionText: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  langOptionTextActive: {
    color: "#f8fafc",
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  cardTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  promptParagraph: {
    color: "#e2e8f0",
    fontSize: 16,
    lineHeight: 24,
  },
  timerCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  timerLabel: {
    color: "#94a3b8",
    fontSize: 13,
  },
  timerValue: {
    color: "#f8fafc",
    fontSize: 36,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  timerHint: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
  },
  statusMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  statusInfo: {
    color: "#93c5fd",
  },
  statusError: {
    color: "#fca5a5",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#cbd5e1",
    fontSize: 14,
  },
  previewCard: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  previewTitle: {
    color: "#cbd5e1",
    fontSize: 14,
    fontWeight: "600",
  },
  previewText: {
    color: "#f8fafc",
    fontSize: 16,
    lineHeight: 24,
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
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  backButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  backButtonText: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "600",
  },
});
