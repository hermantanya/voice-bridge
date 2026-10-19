import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import type {
  ConversationMode,
  LanguageCode,
  SpeakerGender,
} from "./src/config";
import { useAudio } from "./src/hooks/useAudio";
import { useAuth } from "./src/hooks/useAuth";
import { useSocket, type TranslationResult } from "./src/hooks/useSocket";
import { useVoiceProfile } from "./src/hooks/useVoiceProfile";
import {
  loadDevicePrefs,
  saveDevicePrefs,
} from "./src/session/devicePrefsStorage";
import { runHoldToTalkStart, shouldForceStopRecording, shouldReleaseHoldTimestamp, shouldReleaseTurnAfterLocalStop } from "./src/session/holdToTalkSession";
import { generateRoomCode, normalizeRoomCode } from "./src/session/appState";
import { isStreamingPttUplinkAvailable } from "./src/session/streamingPtt";
import { shouldPlayTranslationAudio } from "./src/session/translationPlayback";
import { loadGuestMode, saveGuestMode } from "./src/auth/entryModeStorage";
import { applyServerProfileVoice } from "./src/session/applyServerProfileVoice";
import {
  AuthScreen,
  type AuthScreenMode,
} from "./src/screens/AuthScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SessionScreen } from "./src/screens/SessionScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { VoiceSetupScreen } from "./src/screens/VoiceSetupScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import type { ServerProfileResponse } from "./src/api/profile";

type Screen =
  | "welcome"
  | "auth"
  | "home"
  | "session"
  | "settings"
  | "voiceSetup";

type AuthReturnScreen = "welcome" | "home" | "settings";

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [roomCode, setRoomCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [myLang, setMyLang] = useState<LanguageCode>("en");
  const [speakerGender, setSpeakerGender] = useState<SpeakerGender>("female");
  const [conversationMode, setConversationMode] =
    useState<ConversationMode>("push_to_talk");
  const [playTranslatedVoice, setPlayTranslatedVoice] = useState(true);
  const [streamingPttDev, setStreamingPttDev] = useState(false);
  const [homeResetKey, setHomeResetKey] = useState(0);
  const [devicePrefsLoaded, setDevicePrefsLoaded] = useState(false);
  const [entryReady, setEntryReady] = useState(false);
  const [isGuest, setIsGuest] = useState(false);
  const [authMode, setAuthMode] = useState<AuthScreenMode>("sign-in");
  const [authReturnScreen, setAuthReturnScreen] =
    useState<AuthReturnScreen>("welcome");

  const auth = useAuth();
  const voiceProfile = useVoiceProfile();
  const inSession = screen === "session" && !!activeRoomCode;
  const sessionReady = inSession && voiceProfile.loaded;
  const playAudioRef = useRef<(audioBase64: string) => Promise<void>>(
    async () => {},
  );
  const holdStartedAtRef = useRef<number | null>(null);
  const audioPlayQueueRef = useRef(Promise.resolve());
  const myParticipantIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const [prefs, guest] = await Promise.all([
        loadDevicePrefs(),
        loadGuestMode(),
      ]);
      if (cancelled) {
        return;
      }
      if (prefs) {
        setMyLang(prefs.hearLang);
        setSpeakerGender(prefs.speakerGender);
        setConversationMode(prefs.conversationMode);
        setPlayTranslatedVoice(prefs.playTranslatedVoice);
        setStreamingPttDev(Boolean(prefs.streamingPttDev));
      }
      setIsGuest(guest);
      setEntryReady(true);
      setDevicePrefsLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!auth.loaded || !entryReady) {
      return;
    }
    if (auth.session) {
      setScreen((current) =>
        current === "welcome" || current === "auth" ? "home" : current,
      );
      return;
    }
    if (isGuest) {
      setScreen((current) => (current === "welcome" ? "home" : current));
    }
  }, [auth.loaded, auth.session, entryReady, isGuest]);

  useEffect(() => {
    if (!auth.loaded || !devicePrefsLoaded || !auth.session) {
      return;
    }
    setMyLang(auth.session.profile.hearLang);
    setSpeakerGender(auth.session.profile.speakerGender);
  }, [auth.loaded, auth.session, devicePrefsLoaded]);

  useEffect(() => {
    if (!auth.loaded || !voiceProfile.loaded || !auth.session) {
      return;
    }

    void applyServerProfileVoice(
      auth.session.profile.elevenlabsVoiceId,
      voiceProfile.elevenlabsVoiceId,
      voiceProfile.setElevenLabsVoiceId,
    );
  }, [
    auth.loaded,
    auth.session?.profile.elevenlabsVoiceId,
    auth.session,
    voiceProfile.elevenlabsVoiceId,
    voiceProfile.loaded,
    voiceProfile.setElevenLabsVoiceId,
  ]);

  useEffect(() => {
    if (!auth.signedIn) {
      return;
    }

    const refreshFromServer = () => {
      void auth.refreshSession();
    };

    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        refreshFromServer();
      }
    });

    if (Platform.OS === "web" && typeof document !== "undefined") {
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          refreshFromServer();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      return () => {
        appStateSub.remove();
        document.removeEventListener("visibilitychange", onVisibility);
      };
    }

    return () => appStateSub.remove();
  }, [auth.refreshSession, auth.signedIn]);

  useEffect(() => {
    if (screen !== "settings" || !auth.signedIn) {
      return;
    }

    void auth.refreshSession();
    const interval = setInterval(() => {
      void auth.refreshSession();
    }, 5000);

    return () => clearInterval(interval);
  }, [auth.refreshSession, auth.signedIn, screen]);

  const handleVoiceEnrolled = useCallback(
    async (voiceId: string) => {
      await voiceProfile.setElevenLabsVoiceId(voiceId);
      if (auth.session) {
        try {
          await auth.updateProfile({ elevenlabsVoiceId: voiceId });
        } catch (error) {
          console.warn("Could not sync enrolled voice to profile:", error);
        }
      }
    },
    [auth.session, auth.updateProfile, voiceProfile.setElevenLabsVoiceId],
  );

  const handleRemoveVoice = useCallback(async () => {
    await voiceProfile.removeElevenLabsVoice();
    if (auth.session) {
      try {
        await auth.updateProfile({ elevenlabsVoiceId: null });
      } catch (error) {
        console.warn("Could not clear voice on profile:", error);
      }
    }
  }, [auth.session, auth.updateProfile, voiceProfile.removeElevenLabsVoice]);

  const handleCommitProfileSettings = useCallback(
    (settings: {
      hearLang: LanguageCode;
      speakerGender: SpeakerGender;
      conversationMode: ConversationMode;
      playTranslatedVoice: boolean;
      streamingPttDev?: boolean;
    }) => {
      setMyLang(settings.hearLang);
      setSpeakerGender(settings.speakerGender);
      setConversationMode(settings.conversationMode);
      setPlayTranslatedVoice(settings.playTranslatedVoice);
      if (settings.streamingPttDev !== undefined) {
        setStreamingPttDev(settings.streamingPttDev);
      }
      if (auth.session) {
        void auth
          .updateProfile({
            hearLang: settings.hearLang,
            speakerGender: settings.speakerGender,
          })
          .catch((error) => {
            console.warn("Could not sync profile settings:", error);
          });
      }
      void saveDevicePrefs({
        hearLang: settings.hearLang,
        speakerGender: settings.speakerGender,
        conversationMode: settings.conversationMode,
        playTranslatedVoice: settings.playTranslatedVoice,
        streamingPttDev: settings.streamingPttDev ?? streamingPttDev,
      });
    },
    [auth.session, auth.updateProfile, streamingPttDev],
  );

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    await saveGuestMode(false);
    setIsGuest(false);
    await voiceProfile.setElevenLabsVoiceId(null);
    const prefs = await loadDevicePrefs();
    if (prefs) {
      setMyLang(prefs.hearLang);
      setSpeakerGender(prefs.speakerGender);
      setConversationMode(prefs.conversationMode);
      setPlayTranslatedVoice(prefs.playTranslatedVoice);
    } else {
      setMyLang("en");
      setSpeakerGender("female");
      setConversationMode("push_to_talk");
      setPlayTranslatedVoice(true);
    }
    setScreen("welcome");
  }, [auth.signOut, voiceProfile.setElevenLabsVoiceId]);

  const openAuth = useCallback(
    (mode: AuthScreenMode, returnTo: AuthReturnScreen) => {
      auth.clearError();
      setAuthMode(mode);
      setAuthReturnScreen(returnTo);
      setScreen("auth");
    },
    [auth.clearError],
  );

  const handleGuestMode = useCallback(async () => {
    await saveGuestMode(true);
    setIsGuest(true);
    setScreen("home");
  }, []);

  const finishAuthSuccess = useCallback(
    async (
      profile: ServerProfileResponse,
      mode: AuthScreenMode,
    ): Promise<void> => {
      const guestUpgradingAccount = isGuest;
      await saveGuestMode(false);
      setIsGuest(false);
      setMyLang(profile.profile.hearLang);
      setSpeakerGender(profile.profile.speakerGender);

      if (mode === "create-account") {
        await voiceProfile.setElevenLabsVoiceId(null);
      } else if (
        guestUpgradingAccount &&
        !profile.profile.elevenlabsVoiceId &&
        voiceProfile.elevenlabsVoiceId
      ) {
        try {
          await auth.updateProfile({
            elevenlabsVoiceId: voiceProfile.elevenlabsVoiceId,
          });
        } catch (error) {
          console.warn("Could not upload guest voice on sign-in:", error);
        }
      } else {
        await applyServerProfileVoice(
          profile.profile.elevenlabsVoiceId,
          voiceProfile.elevenlabsVoiceId,
          voiceProfile.setElevenLabsVoiceId,
        );
      }

      setScreen(mode === "create-account" ? "settings" : "home");
    },
    [
      auth.updateProfile,
      isGuest,
      voiceProfile.elevenlabsVoiceId,
      voiceProfile.setElevenLabsVoiceId,
    ],
  );

  const handleVerifyOtp = useCallback(
    async (email: string, code: string) => {
      const profile = await auth.signInWithOtp(email, code);
      if (!profile) {
        return null;
      }
      await finishAuthSuccess(profile, authMode);
      return profile;
    },
    [auth.signInWithOtp, authMode, finishAuthSuccess],
  );

  const enqueueIncomingAudio = useCallback((audioBase64: string) => {
    if (!audioBase64.trim()) {
      return;
    }
    audioPlayQueueRef.current = audioPlayQueueRef.current
      .catch(() => undefined)
      .then(() => playAudioRef.current(audioBase64))
      .catch((error) => {
        console.warn("Could not play incoming translation:", error);
      });
  }, []);

  const handleIncomingTranslation = useCallback(
    (result: TranslationResult) => {
      if (
        !playTranslatedVoice ||
        !shouldPlayTranslationAudio(myParticipantIdRef.current, {
          kind: "translation_result",
          fromParticipantId: result.fromParticipantId,
          turnId: result.turnId,
          audioBase64: result.audioBase64,
          skippedTts: result.skippedTts,
        })
      ) {
        return;
      }
      enqueueIncomingAudio(result.audioBase64);
    },
    [enqueueIncomingAudio, playTranslatedVoice],
  );

  const handlePartialTranslationAudio = useCallback(
    (payload: {
      audioBase64?: string;
      fromParticipantId?: string;
      turnId?: string;
      role?: string;
    }) => {
      if (
        !playTranslatedVoice ||
        !shouldPlayTranslationAudio(myParticipantIdRef.current, {
          kind: "partial_translation_audio",
          fromParticipantId: payload.fromParticipantId,
          turnId: payload.turnId,
          role: payload.role,
          audioBase64: payload.audioBase64,
        })
      ) {
        return;
      }
      enqueueIncomingAudio(payload.audioBase64!);
    },
    [enqueueIncomingAudio, playTranslatedVoice],
  );

  const socket = useSocket({
    roomCode: activeRoomCode,
    myLang,
    speakerGender,
    elevenlabsVoiceId: voiceProfile.elevenlabsVoiceId,
    playTranslatedVoice,
    streamingPtt: isStreamingPttUplinkAvailable(streamingPttDev),
    enabled: sessionReady,
    onIncomingTranslation: handleIncomingTranslation,
    onPartialTranslationAudio: handlePartialTranslationAudio,
  });

  const streamingPttUplink = useMemo(
    () =>
      isStreamingPttUplinkAvailable(
        streamingPttDev,
        socket.serverStreamingPttEnabled,
      ),
    [streamingPttDev, socket.serverStreamingPttEnabled],
  );

  useEffect(() => {
    myParticipantIdRef.current = socket.participantId;
  }, [socket.participantId]);

  const handleAudioReady = useCallback(
    async (
      audioBase64: string,
      format: string,
      recordingDurationMs: number,
    ): Promise<boolean> => {
      const holdStartedAt = holdStartedAtRef.current;
      holdStartedAtRef.current = null;
      const durationMs = holdStartedAt
        ? Math.max(recordingDurationMs, Date.now() - holdStartedAt)
        : recordingDurationMs;
      if (streamingPttUplink) {
        return socket.stopStreamingPtt(
          audioBase64,
          format,
          durationMs,
          holdStartedAt ?? undefined,
        );
      }
      return socket.sendAudioChunk(
        audioBase64,
        format,
        durationMs,
        holdStartedAt ?? undefined,
      );
    },
    [socket.sendAudioChunk, socket.stopStreamingPtt, streamingPttUplink],
  );

  const handleStreamingRecordingStarted = useCallback(async () => {
    if (!streamingPttUplink || !socket.isMyTurn) {
      return;
    }
    const ok = await socket.startStreamingPtt();
    if (!ok) {
      return;
    }
  }, [socket.isMyTurn, socket.startStreamingPtt, streamingPttUplink]);

  const handleStreamingChunk = useCallback(
    (audioBase64: string, format: string) => {
      socket.sendStreamingAudioChunk(audioBase64, format);
    },
    [socket.sendStreamingAudioChunk],
  );

  const audio = useAudio({
    onAudioReady: handleAudioReady,
    enabled: sessionReady,
    streamingUplinkEnabled: streamingPttUplink,
    onStreamingChunk: handleStreamingChunk,
    onStreamingRecordingStarted: handleStreamingRecordingStarted,
  });

  useEffect(() => {
    playAudioRef.current = audio.playAudioBase64;
  }, [audio.playAudioBase64]);

  const handleStopRecording = useCallback(async () => {
    const hadSpeakingTurn = socket.isMyTurn;
    if (!audio.isRecording) {
      return false;
    }
    const delivered = await audio.stopRecording();
    if (!delivered) {
      holdStartedAtRef.current = null;
      if (hadSpeakingTurn) {
        socket.setErrorMessage(
          "Could not read that recording. Hold the button a little longer and try again.",
        );
      }
    }
    if (
      shouldReleaseTurnAfterLocalStop({
        hadSpeakingTurn,
        deliveredAudio: delivered,
      })
    ) {
      await socket.releaseTurn();
    }
    return delivered;
  }, [
    audio.isRecording,
    audio.stopRecording,
    socket.isMyTurn,
    socket.releaseTurn,
    socket.setErrorMessage,
  ]);

  const handleStartRecording = useCallback(
    async (stillHolding: () => boolean) => {
      holdStartedAtRef.current = Date.now();
      let result: Awaited<ReturnType<typeof runHoldToTalkStart>>;
      try {
        result = await runHoldToTalkStart({
          stillHolding,
          claimTurn: socket.claimTurn,
          releaseTurn: socket.releaseTurn,
          startRecording: audio.startRecording,
          stopRecording: handleStopRecording,
        });
      } catch (error) {
        holdStartedAtRef.current = null;
        throw error;
      }

      if (result === "denied") {
        holdStartedAtRef.current = null;
        throw new Error("Someone else started speaking first");
      }

      if (shouldReleaseHoldTimestamp(result)) {
        holdStartedAtRef.current = null;
      }
    },
    [
      audio.startRecording,
      handleStopRecording,
      socket.claimTurn,
      socket.releaseTurn,
    ],
  );

  useEffect(() => {
    if (
      !shouldForceStopRecording({
        inSession,
        isMyTurn: socket.isMyTurn,
        isOpenTurn: socket.isOpenTurn,
        isRecording: audio.isRecording,
      })
    ) {
      return;
    }

    void handleStopRecording();
  }, [
    audio.isRecording,
    handleStopRecording,
    inSession,
    socket.isMyTurn,
    socket.isOpenTurn,
  ]);

  const handleEndSpeaking = useCallback(async () => {
    const hadSpeakingTurn = socket.isMyTurn;
    let delivered = false;
    if (audio.isRecording) {
      delivered = await audio.stopRecording();
    }
    if (
      shouldReleaseTurnAfterLocalStop({
        hadSpeakingTurn,
        deliveredAudio: delivered,
      })
    ) {
      await socket.releaseTurn();
    }
  }, [
    audio.isRecording,
    audio.stopRecording,
    socket.isMyTurn,
    socket.releaseTurn,
  ]);

  const handleLeaveSession = useCallback(() => {
    audio.releaseMicrophone();
    socket.disconnect();
    setActiveRoomCode("");
    setRoomCode("");
    setHomeResetKey((key) => key + 1);
    setScreen("home");
  }, [audio.releaseMicrophone, socket.disconnect]);

  const content = useMemo(() => {
    if (screen === "welcome") {
      return (
        <WelcomeScreen
          onSignIn={() => openAuth("sign-in", "welcome")}
          onCreateAccount={() => openAuth("create-account", "welcome")}
          onGuestMode={() => {
            void handleGuestMode();
          }}
        />
      );
    }

    if (screen === "auth") {
      return (
        <AuthScreen
          mode={authMode}
          authBusy={auth.busy}
          authError={auth.error}
          onBack={() => setScreen(authReturnScreen)}
          onClearAuthError={auth.clearError}
          onRequestOtp={auth.requestOtp}
          onVerifyOtp={handleVerifyOtp}
        />
      );
    }

    if (screen === "voiceSetup") {
      return (
        <VoiceSetupScreen
          myLang={myLang}
          speakerGender={speakerGender}
          existingVoiceId={voiceProfile.elevenlabsVoiceId}
          onComplete={handleVoiceEnrolled}
          onBack={() => setScreen("settings")}
        />
      );
    }

    if (screen === "settings") {
      return (
        <SettingsScreen
          myLang={myLang}
          speakerGender={speakerGender}
          conversationMode={conversationMode}
          playTranslatedVoice={playTranslatedVoice}
          streamingPttDev={streamingPttDev}
          onCommitProfileSettings={handleCommitProfileSettings}
          voiceStatus={voiceProfile.voiceStatus}
          elevenlabsVoiceId={voiceProfile.elevenlabsVoiceId}
          onOpenVoiceSetup={() => setScreen("voiceSetup")}
          onRemoveVoice={handleRemoveVoice}
          onBack={() => setScreen("home")}
          showMicrophoneSettings={Platform.OS === "web"}
          showStreamingPttDev={Platform.OS === "web"}
          microphoneDevices={audio.inputDevices}
          selectedMicrophoneId={audio.selectedDeviceId}
          onMicrophoneChange={audio.setSelectedDeviceId}
          onRefreshMicrophones={audio.refreshInputDevices}
          signedInEmail={auth.session?.email ?? null}
          authError={auth.error}
          onSignOut={handleSignOut}
          onClearAuthError={auth.clearError}
          onOpenSignIn={() => openAuth("sign-in", "settings")}
          onOpenCreateAccount={() => openAuth("create-account", "settings")}
        />
      );
    }

    if (screen === "session") {
      return (
        <SessionScreen
          roomCode={activeRoomCode}
          myLang={myLang}
          conversationMode={conversationMode}
          partnerLang={socket.partnerLang}
          voiceStatus={voiceProfile.voiceStatus}
          lastReceived={socket.lastReceived}
          status={socket.status}
          participants={socket.participants}
          loadingVoiceProfile={!voiceProfile.loaded}
          participantId={socket.participantId}
          errorMessage={socket.errorMessage}
          isRecording={audio.isRecording}
          isMyTurn={socket.isMyTurn}
          isOpenTurn={socket.isOpenTurn}
          isProcessing={socket.isProcessing}
          turnParticipantId={socket.turnParticipantId}
          turnPhase={socket.turnPhase}
          transcript={socket.transcript}
          partnerPartial={socket.partnerPartial}
          myBillableMs={socket.myBillableMs}
          partnerBillableMs={socket.partnerBillableMs}
          sessionStartedAt={socket.sessionStartedAt}
          onStartRecording={handleStartRecording}
          onStopRecording={handleStopRecording}
          onEndSpeaking={handleEndSpeaking}
          onLeave={handleLeaveSession}
        />
      );
    }

    return (
      <HomeScreen
        key={`home-${homeResetKey}`}
        roomCode={roomCode}
        myLang={myLang}
        speakerGender={speakerGender}
        voiceStatus={voiceProfile.voiceStatus}
        onRoomCodeChange={(value) => setRoomCode(value.toUpperCase())}
        onCreateRoom={() => {
          const code = generateRoomCode();
          setRoomCode("");
          setActiveRoomCode(code);
          setScreen("session");
        }}
        onJoinRoom={() => {
          const code = normalizeRoomCode(roomCode);
          setActiveRoomCode(code);
          setRoomCode("");
          setScreen("session");
        }}
        onOpenSettings={() => setScreen("settings")}
        showGuestBanner={isGuest && !auth.session}
        onOpenSignIn={() => openAuth("sign-in", "home")}
      />
    );
  }, [
    activeRoomCode,
    audio.inputDevices,
    audio.isRecording,
    audio.refreshInputDevices,
    audio.releaseMicrophone,
    audio.selectedDeviceId,
    audio.setSelectedDeviceId,
    handleStopRecording,
    handleEndSpeaking,
    handleLeaveSession,
    conversationMode,
    playTranslatedVoice,
    handleCommitProfileSettings,
    handleRemoveVoice,
    handleSignOut,
    handleStartRecording,
    handleGuestMode,
    handleVerifyOtp,
    handleVoiceEnrolled,
    auth.error,
    auth.session,
    authMode,
    authReturnScreen,
    auth.busy,
    auth.clearError,
    auth.requestOtp,
    homeResetKey,
    isGuest,
    openAuth,
    myLang,
    speakerGender,
    voiceProfile.elevenlabsVoiceId,
    voiceProfile.voiceStatus,
    voiceProfile.loaded,
    roomCode,
    screen,
    socket.myBillableMs,
    socket.partnerBillableMs,
    socket.sessionStartedAt,
    socket.errorMessage,
    socket.isMyTurn,
    socket.isOpenTurn,
    socket.isProcessing,
    socket.turnParticipantId,
    socket.turnPhase,
    socket.participantId,
    socket.participants,
    socket.partnerLang,
    socket.lastReceived,
    socket.status,
    socket.transcript,
    socket.partnerPartial,
  ]);

  if (!auth.loaded || !entryReady) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      {content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
});
