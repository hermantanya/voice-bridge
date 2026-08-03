import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import type { LanguageCode, SpeakerGender } from "./src/config";
import { useAudio } from "./src/hooks/useAudio";
import { useSocket } from "./src/hooks/useSocket";
import { useVoiceProfile } from "./src/hooks/useVoiceProfile";
import { runHoldToTalkStart, shouldForceStopRecording, shouldReleaseHoldTimestamp } from "./src/session/holdToTalkSession";
import { generateRoomCode, normalizeRoomCode } from "./src/session/appState";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SessionScreen } from "./src/screens/SessionScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { VoiceSetupScreen } from "./src/screens/VoiceSetupScreen";

type Screen = "home" | "session" | "settings" | "voiceSetup";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roomCode, setRoomCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [myLang, setMyLang] = useState<LanguageCode>("en");
  const [speakerGender, setSpeakerGender] = useState<SpeakerGender>("female");
  const [homeResetKey, setHomeResetKey] = useState(0);

  const voiceProfile = useVoiceProfile();
  const inSession = screen === "session" && !!activeRoomCode;
  const sessionReady = inSession && voiceProfile.loaded;
  const playAudioRef = useRef<(audioBase64: string) => Promise<void>>(
    async () => {},
  );
  const holdStartedAtRef = useRef<number | null>(null);

  const handleIncomingTranslation = useCallback(
    (result: { audioBase64: string }) => {
      void playAudioRef.current(result.audioBase64);
    },
    [],
  );

  const socket = useSocket({
    roomCode: activeRoomCode,
    myLang,
    speakerGender,
    elevenlabsVoiceId: voiceProfile.elevenlabsVoiceId,
    enabled: sessionReady,
    onIncomingTranslation: handleIncomingTranslation,
  });

  const handleAudioReady = useCallback(
    (audioBase64: string, format: string, recordingDurationMs: number) => {
      const holdStartedAt = holdStartedAtRef.current;
      holdStartedAtRef.current = null;
      const durationMs = holdStartedAt
        ? Math.max(recordingDurationMs, Date.now() - holdStartedAt)
        : recordingDurationMs;
      socket.sendAudioChunk(
        audioBase64,
        format,
        durationMs,
        holdStartedAt ?? undefined,
      );
    },
    [socket.sendAudioChunk],
  );

  const audio = useAudio({
    onAudioReady: handleAudioReady,
    enabled: sessionReady,
  });

  useEffect(() => {
    playAudioRef.current = audio.playAudioBase64;
  }, [audio.playAudioBase64]);

  const handleStartRecording = useCallback(
    async (stillHolding: () => boolean) => {
      holdStartedAtRef.current = Date.now();
      const result = await runHoldToTalkStart({
        stillHolding,
        claimTurn: socket.claimTurn,
        releaseTurn: socket.releaseTurn,
        startRecording: audio.startRecording,
        stopRecording: audio.stopRecording,
      });

      if (result === "denied") {
        throw new Error("Someone else started speaking first");
      }

      if (shouldReleaseHoldTimestamp(result)) {
        holdStartedAtRef.current = null;
      }
    },
    [audio.startRecording, audio.stopRecording, socket.claimTurn, socket.releaseTurn],
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

    void audio.stopRecording();
  }, [
    audio.isRecording,
    audio.stopRecording,
    inSession,
    socket.isMyTurn,
    socket.isOpenTurn,
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
    if (screen === "voiceSetup") {
      return (
        <VoiceSetupScreen
          myLang={myLang}
          speakerGender={speakerGender}
          existingVoiceId={voiceProfile.elevenlabsVoiceId}
          onComplete={voiceProfile.setElevenLabsVoiceId}
          onBack={() => setScreen("settings")}
        />
      );
    }

    if (screen === "settings") {
      return (
        <SettingsScreen
          myLang={myLang}
          onMyLangChange={setMyLang}
          speakerGender={speakerGender}
          onSpeakerGenderChange={setSpeakerGender}
          voiceStatus={voiceProfile.voiceStatus}
          elevenlabsVoiceId={voiceProfile.elevenlabsVoiceId}
          onOpenVoiceSetup={() => setScreen("voiceSetup")}
          onRemoveVoice={voiceProfile.removeElevenLabsVoice}
          onBack={() => setScreen("home")}
          showMicrophoneSettings={Platform.OS === "web"}
          microphoneDevices={audio.inputDevices}
          selectedMicrophoneId={audio.selectedDeviceId}
          onMicrophoneChange={audio.setSelectedDeviceId}
          onRefreshMicrophones={audio.refreshInputDevices}
        />
      );
    }

    if (screen === "session") {
      return (
        <SessionScreen
          roomCode={activeRoomCode}
          myLang={myLang}
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
          myBillableMs={socket.myBillableMs}
          partnerBillableMs={socket.partnerBillableMs}
          sessionStartedAt={socket.sessionStartedAt}
          onStartRecording={handleStartRecording}
          onStopRecording={audio.stopRecording}
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
    audio.stopRecording,
    handleLeaveSession,
    handleStartRecording,
    homeResetKey,
    myLang,
    speakerGender,
    voiceProfile.elevenlabsVoiceId,
    voiceProfile.removeElevenLabsVoice,
    voiceProfile.setElevenLabsVoiceId,
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
  ]);

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
