import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { SpeakingTimeStat } from "../components/SpeakingTimeStat";
import { TranscriptPanel } from "../components/TranscriptPanel";
import {
  languageLabel,
  SERVER_URL,
  type ConversationMode,
  type LanguageCode,
} from "../config";
import { getSessionModeSubtitle } from "../session/conversationMode";
import type { TranscriptEntry, TranslationResult } from "../hooks/useSocket";
import {
  canStartTalking,
  getSelfMicHint,
  getSelfMicLabel,
  getTurnLabel,
} from "../session/sessionScreenState";
import { voiceProfileLabel, type VoiceProfileStatus } from "../session/appState";
import { formatSessionDuration } from "../utils/timeFormat";

type TurnPhase = "waiting" | "speaking" | "processing";

type SessionScreenProps = {
  roomCode: string;
  myLang: LanguageCode;
  conversationMode?: ConversationMode;
  partnerLang: LanguageCode | null;
  voiceStatus: VoiceProfileStatus;
  lastReceived: TranslationResult | null;
  loadingVoiceProfile?: boolean;
  status: "connecting" | "connected" | "disconnected" | "error";
  participants: number;
  participantId: string | null;
  errorMessage: string | null;
  isRecording: boolean;
  isMyTurn: boolean;
  isOpenTurn: boolean;
  isProcessing: boolean;
  turnParticipantId: string | null;
  turnPhase: TurnPhase;
  transcript: TranscriptEntry[];
  partnerPartial?: { sourceText: string; translatedText: string } | null;
  myBillableMs: number;
  partnerBillableMs: number;
  sessionStartedAt: number | null;
  onStartRecording: (stillHolding: () => boolean) => Promise<void>;
  onStopRecording: () => void | Promise<void>;
  onEndSpeaking?: () => Promise<void>;
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
  myLang,
  conversationMode = "push_to_talk",
  partnerLang,
  voiceStatus,
  lastReceived,
  loadingVoiceProfile = false,
  status,
  participants,
  participantId,
  errorMessage,
  isRecording,
  isMyTurn,
  isOpenTurn,
  isProcessing,
  turnParticipantId,
  turnPhase,
  transcript,
  partnerPartial = null,
  myBillableMs,
  partnerBillableMs,
  sessionStartedAt,
  onStartRecording,
  onStopRecording,
  onEndSpeaking,
  onLeave,
}: SessionScreenProps) {
  const [selfMuted, setSelfMuted] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const { width: windowWidth } = useWindowDimensions();
  const stackMicBanner = windowWidth < 520;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const holdingRef = useRef(false);
  const buttonScale = useRef(new Animated.Value(1)).current;
  const buttonGlow = useRef(new Animated.Value(0)).current;
  const turnPulse = useRef(new Animated.Value(1)).current;

  const myActivityPending =
    isRecording ||
    (turnParticipantId === participantId &&
      (turnPhase === "speaking" || turnPhase === "processing"));

  const partnerActivityPending =
    turnParticipantId !== null &&
    turnParticipantId !== participantId &&
    (turnPhase === "speaking" || turnPhase === "processing");

  const canTalk = canStartTalking({
    status,
    participants,
    isProcessing,
    isRecording,
    isOpenTurn,
    isMyTurn,
    isSelfMuted: selfMuted,
  });

  const selfMicLabel = getSelfMicLabel(selfMuted);
  const selfMicHint = getSelfMicHint(selfMuted, conversationMode);
  const modeSubtitle = getSessionModeSubtitle(conversationMode);

  const turnLabel = getTurnLabel({
    participants,
    isProcessing,
    isMyTurn,
    isOpenTurn,
    isSelfMuted: selfMuted,
  });

  const turnColor = (() => {
    if (isProcessing) {
      return "#eab308";
    }
    if (isMyTurn) {
      return "#22c55e";
    }
    if (isOpenTurn) {
      return "#60a5fa";
    }
    return "#64748b";
  })();

  const lastPlaybackLabel = (() => {
    if (!lastReceived) {
      return null;
    }
    if (lastReceived.skippedTts) {
      return "Last heard: same language (transcript only)";
    }
    if (lastReceived.usedClonedVoice) {
      return "Last heard: partner's cloned voice";
    }
    return "Last heard: preset voice";
  })();

  useEffect(() => {
    setRecordError(null);
  }, [errorMessage]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (isRecording) {
      const scaleLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonScale, {
            toValue: 1.04,
            duration: 550,
            useNativeDriver: true,
          }),
          Animated.timing(buttonScale, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }),
        ]),
      );
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonGlow, {
            toValue: 1,
            duration: 550,
            useNativeDriver: true,
          }),
          Animated.timing(buttonGlow, {
            toValue: 0.35,
            duration: 550,
            useNativeDriver: true,
          }),
        ]),
      );

      scaleLoop.start();
      glowLoop.start();

      return () => {
        scaleLoop.stop();
        glowLoop.stop();
        buttonScale.setValue(1);
        buttonGlow.setValue(0);
      };
    }

    if (isProcessing) {
      buttonGlow.setValue(0.35);
      const processingLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonScale, {
            toValue: 1.02,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(buttonScale, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      );
      const processingGlow = Animated.loop(
        Animated.sequence([
          Animated.timing(buttonGlow, {
            toValue: 1,
            duration: 900,
            useNativeDriver: true,
          }),
          Animated.timing(buttonGlow, {
            toValue: 0.35,
            duration: 900,
            useNativeDriver: true,
          }),
        ]),
      );

      processingLoop.start();
      processingGlow.start();

      return () => {
        processingLoop.stop();
        processingGlow.stop();
        buttonScale.setValue(1);
        buttonGlow.setValue(0);
      };
    }

    buttonScale.setValue(1);
    buttonGlow.setValue(0);
  }, [buttonGlow, buttonScale, isProcessing, isRecording]);

  useEffect(() => {
    if (!isRecording && !isProcessing) {
      turnPulse.setValue(1);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(turnPulse, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(turnPulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [isProcessing, isRecording, turnPulse]);

  const stopTalking = useCallback(async () => {
    const wasHolding = holdingRef.current;
    holdingRef.current = false;

    if (!wasHolding && !isRecording) {
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
  }, [isRecording, onStopRecording]);

  const handleToggleSelfMute = useCallback(async () => {
    if (selfMuted) {
      setSelfMuted(false);
      return;
    }

    holdingRef.current = false;
    try {
      setRecordError(null);
      await stopTalking();
      if (onEndSpeaking) {
        await onEndSpeaking();
      }
    } catch (error) {
      setRecordError(
        error instanceof Error ? error.message : "Could not stop speaking",
      );
      return;
    }
    setSelfMuted(true);
  }, [onEndSpeaking, selfMuted, stopTalking]);

  const handleTalkStart = async () => {
    if (selfMuted) {
      return;
    }

    if (isRecording) {
      await stopTalking();
      return;
    }

    if (!canTalk || holdingRef.current) {
      return;
    }

    holdingRef.current = true;

    try {
      setRecordError(null);
      await onStartRecording(() => holdingRef.current);
      if (!holdingRef.current) {
        await onStopRecording();
      }
    } catch (error) {
      holdingRef.current = false;
      setRecordError(
        error instanceof Error ? error.message : "Could not start recording",
      );
    }
  };

  const handleTalkEnd = () => {
    void stopTalking();
  };

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const handleGlobalRelease = () => {
      void stopTalking();
    };

    document.addEventListener("pointerup", handleGlobalRelease, true);
    document.addEventListener("pointercancel", handleGlobalRelease, true);

    return () => {
      document.removeEventListener("pointerup", handleGlobalRelease, true);
      document.removeEventListener("pointercancel", handleGlobalRelease, true);
    };
  }, [stopTalking]);

  const showSessionStats = participants >= 2;

  const talkButton = (
    <Animated.View
      style={[
        styles.talkButtonWrap,
        {
          transform: [{ scale: buttonScale }],
          opacity: isProcessing
            ? buttonGlow.interpolate({
                inputRange: [0, 1],
                outputRange: [0.82, 1],
              })
            : 1,
        },
      ]}
    >
      <Pressable
        style={[
          styles.talkButton,
          isRecording && styles.talkButtonActive,
          isProcessing && styles.talkButtonProcessing,
          (selfMuted || (!canTalk && !isRecording && !isProcessing)) &&
            styles.talkButtonDisabled,
        ]}
        onPressIn={Platform.OS === "web" ? undefined : handleTalkStart}
        onPressOut={Platform.OS === "web" ? undefined : handleTalkEnd}
        onPointerDown={Platform.OS === "web" ? () => void handleTalkStart() : undefined}
        onPointerUp={Platform.OS === "web" ? handleTalkEnd : undefined}
        onPointerLeave={Platform.OS === "web" ? handleTalkEnd : undefined}
        disabled={
          selfMuted || (Platform.OS !== "web" && !canTalk && !isRecording)
        }
        accessibilityRole="button"
        accessibilityLabel={
          selfMuted
            ? "Hold to talk disabled while you are muted"
            : isRecording
              ? "Listening, release to stop"
              : isProcessing
                ? "Translating"
                : isMyTurn || isOpenTurn
                  ? "Hold to talk"
                  : "Partner is speaking"
        }
        accessibilityState={{
          disabled: selfMuted || (!canTalk && !isRecording),
        }}
      >
        {isRecording ? (
          <View style={styles.talkButtonContent}>
            <Animated.View style={[styles.recordingDot, { opacity: buttonGlow }]} />
            <Text style={styles.talkButtonText}>Listening...</Text>
          </View>
        ) : isProcessing ? (
          <View style={styles.talkButtonContent}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.talkButtonSubtext}>Translating...</Text>
          </View>
        ) : selfMuted ? (
          <Text style={styles.talkButtonText}>Muted</Text>
        ) : (
          <Text style={styles.talkButtonText}>
            {isMyTurn || isOpenTurn ? "Hold to talk" : "Partner is speaking"}
          </Text>
        )}
      </Pressable>
      {isRecording ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.talkButtonRing, { opacity: buttonGlow }]}
        />
      ) : null}
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Session</Text>
        <Text style={styles.roomCodeInline}>{roomCode}</Text>
        <Text style={styles.modeSubtitle}>{modeSubtitle}</Text>
      </View>

      <View
        style={[
          styles.micStatusBanner,
          stackMicBanner && styles.micStatusBannerStack,
          selfMuted ? styles.micStatusBannerMuted : styles.micStatusBannerLive,
        ]}
        accessibilityRole="summary"
        accessibilityLabel={`${selfMicLabel}. ${selfMicHint}`}
      >
        <View style={styles.micStatusHeaderRow}>
          <View
            style={[
              styles.micStatusDot,
              selfMuted ? styles.micStatusDotMuted : styles.micStatusDotLive,
            ]}
          />
          <View style={styles.micStatusCopy}>
            <Text style={styles.micStatusTitle}>{selfMicLabel}</Text>
            <Text style={styles.micStatusHint}>{selfMicHint}</Text>
          </View>
        </View>
        <Pressable
          style={[
            styles.micToggleButton,
            stackMicBanner && styles.micToggleButtonStacked,
            selfMuted && styles.micToggleButtonUnmute,
          ]}
          onPress={() => {
            void handleToggleSelfMute();
          }}
          accessibilityRole="switch"
          accessibilityLabel={
            selfMuted ? "Unmute yourself" : "Mute yourself"
          }
          accessibilityState={{ checked: !selfMuted }}
        >
          <Text
            style={[
              styles.micToggleButtonText,
              selfMuted && styles.micToggleButtonTextUnmute,
            ]}
          >
            {selfMuted ? "Unmute" : "Mute"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.talkSection}>
        {talkButton}
        {recordError ? <Text style={styles.error}>{recordError}</Text> : null}
      </View>

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={styles.mainScrollContent}
        scrollEnabled={!isRecording}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        {showSessionStats ? (
          <View style={styles.statsCard}>
            <View style={styles.statRow}>
              <View style={styles.statLabelBlock}>
                <Text style={styles.statLabel}>Session duration</Text>
                <Text style={styles.statHint}>Connected with partner</Text>
              </View>
              <Text style={styles.statValue}>
                {sessionStartedAt
                  ? formatSessionDuration(sessionStartedAt, nowMs)
                  : "0:00"}
              </Text>
            </View>
            <SpeakingTimeStat
              label="Your speaking time"
              hint="Your hold + translation"
              billableMs={myBillableMs}
              pending={myActivityPending}
              highlighted
            />
            <SpeakingTimeStat
              label="Partner speaking time"
              hint="Their hold + translation"
              billableMs={partnerBillableMs}
              pending={partnerActivityPending}
            />
          </View>
        ) : null}

        <View style={styles.compactCard}>
          <View style={styles.compactRow}>
            <View style={styles.statusRow}>
              <View
                style={[styles.statusDot, { backgroundColor: statusColor(status) }]}
              />
              <Text style={styles.compactValue}>{statusLabel(status)}</Text>
            </View>
            <Text style={styles.compactMeta}>
              {participants} participant{participants === 1 ? "" : "s"}
            </Text>
          </View>
          <Text style={styles.compactMeta}>
            Translate to: {languageLabel(myLang)}
            {partnerLang ? ` · Partner: ${languageLabel(partnerLang)}` : ""}
          </Text>
          <Text style={styles.compactMeta}>
            Your voice: {voiceProfileLabel(voiceStatus)}
            {loadingVoiceProfile ? " (loading…)" : ""}
          </Text>
          {lastPlaybackLabel ? (
            <Text style={styles.compactMeta}>{lastPlaybackLabel}</Text>
          ) : null}
        </View>

        <View style={[styles.turnCard, { borderColor: turnColor }]}>
          <Animated.View
            style={[styles.turnDot, { backgroundColor: turnColor, opacity: turnPulse }]}
          />
          <Text style={[styles.turnText, { color: turnColor }]}>{turnLabel}</Text>
        </View>

        {participants < 2 ? (
          <Text style={styles.hint}>
            Waiting for a second participant to join. Both devices must use the
            same server ({SERVER_URL.replace(/^https?:\/\//, "")}).
          </Text>
        ) : selfMuted ? (
          <Text style={styles.hint} numberOfLines={2}>
            Mic is off. Tap Unmute above, then hold the button to speak.
          </Text>
        ) : isMyTurn || isOpenTurn ? (
          <Text style={styles.hint} numberOfLines={2}>
            Hold to talk.
            {Platform.OS === "web"
              ? " Pick Mac mic in Language settings."
              : ""}
          </Text>
        ) : isProcessing ? (
          <Text style={styles.hint}>Translating...</Text>
        ) : (
          <Text style={styles.hint}>Partner is speaking.</Text>
        )}

        {partnerPartial?.translatedText ? (
          <View style={styles.partialCard} accessibilityLiveRegion="polite">
            <Text style={styles.partialLabel}>Partner (live)</Text>
            {partnerPartial.sourceText ? (
              <Text style={styles.partialSource}>{partnerPartial.sourceText}</Text>
            ) : null}
            <Text style={styles.partialTranslation}>
              {partnerPartial.translatedText}
            </Text>
          </View>
        ) : null}

        <TranscriptPanel entries={transcript} embedded />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Pressable style={styles.leaveButton} onPress={onLeave}>
          <Text style={styles.leaveButtonText}>Leave session</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f172a",
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 16,
  },
  header: {
    marginBottom: 12,
    gap: 8,
  },
  micStatusBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  micStatusBannerStack: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  micStatusHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  micStatusBannerLive: {
    backgroundColor: "#14532d",
    borderColor: "#22c55e",
  },
  micStatusBannerMuted: {
    backgroundColor: "#334155",
    borderColor: "#64748b",
  },
  micStatusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    flexShrink: 0,
  },
  micStatusDotLive: {
    backgroundColor: "#4ade80",
  },
  micStatusDotMuted: {
    backgroundColor: "#94a3b8",
  },
  micStatusCopy: {
    flex: 1,
    gap: 2,
  },
  micStatusTitle: {
    color: "#f8fafc",
    fontSize: 17,
    fontWeight: "700",
  },
  micStatusHint: {
    color: "#cbd5e1",
    fontSize: 13,
    lineHeight: 18,
  },
  micToggleButton: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#475569",
    flexShrink: 0,
  },
  micToggleButtonStacked: {
    alignSelf: "stretch",
    alignItems: "center",
  },
  micToggleButtonUnmute: {
    backgroundColor: "#22c55e",
    borderColor: "#16a34a",
  },
  micToggleButtonText: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  micToggleButtonTextUnmute: {
    color: "#0f172a",
  },
  talkSection: {
    marginBottom: 12,
    gap: 8,
  },
  title: {
    color: "#f8fafc",
    fontSize: 28,
    fontWeight: "700",
  },
  roomCodeInline: {
    color: "#60a5fa",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 2,
  },
  modeSubtitle: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
  },
  statsCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  statLabelBlock: {
    flex: 1,
    flexShrink: 1,
    gap: 2,
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  statHint: {
    color: "#64748b",
    fontSize: 11,
    lineHeight: 14,
  },
  statValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    minWidth: 52,
    textAlign: "right",
  },
  statValueHighlight: {
    color: "#60a5fa",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flexShrink: 0,
    minWidth: 52,
    textAlign: "right",
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 24,
    gap: 0,
  },
  compactCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 12,
    gap: 6,
    marginBottom: 12,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  compactValue: {
    color: "#f8fafc",
    fontSize: 14,
    fontWeight: "600",
  },
  compactMeta: {
    color: "#94a3b8",
    fontSize: 13,
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
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  turnCard: {
    marginBottom: 8,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  turnDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  turnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  partialCard: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 14,
    marginBottom: 12,
    gap: 6,
  },
  partialLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  partialSource: {
    color: "#cbd5e1",
    fontSize: 14,
    lineHeight: 20,
  },
  partialTranslation: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "600",
    lineHeight: 22,
  },
  talkButtonWrap: {
    position: "relative",
  },
  talkButton: {
    backgroundColor: "#3b82f6",
    borderRadius: 999,
    paddingVertical: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 76,
  },
  talkButtonActive: {
    backgroundColor: "#ef4444",
  },
  talkButtonProcessing: {
    backgroundColor: "#ca8a04",
  },
  talkButtonDisabled: {
    opacity: 0.5,
  },
  talkButtonRing: {
    position: "absolute",
    top: -6,
    right: -6,
    bottom: -6,
    left: -6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "#fca5a5",
  },
  talkButtonContent: {
    alignItems: "center",
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#ffffff",
  },
  talkButtonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  talkButtonSubtext: {
    color: "#fef3c7",
    fontSize: 14,
    fontWeight: "600",
  },
  error: {
    color: "#f87171",
    fontSize: 14,
  },
  leaveButton: {
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
