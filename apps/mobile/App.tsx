import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import type { LanguageCode } from "./src/config";
import { useAudio } from "./src/hooks/useAudio";
import { useSocket } from "./src/hooks/useSocket";
import { HomeScreen } from "./src/screens/HomeScreen";
import { SessionScreen } from "./src/screens/SessionScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";

type Screen = "home" | "session" | "settings";

function generateRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [roomCode, setRoomCode] = useState("");
  const [activeRoomCode, setActiveRoomCode] = useState("");
  const [speakLang, setSpeakLang] = useState<LanguageCode>("en");
  const [hearLang, setHearLang] = useState<LanguageCode>("he");

  const inSession = screen === "session" && !!activeRoomCode;
  const playAudioRef = useRef<(audioBase64: string) => Promise<void>>(
    async () => {},
  );

  const handleIncomingTranslation = useCallback(
    (result: { audioBase64: string }) => {
      void playAudioRef.current(result.audioBase64);
    },
    [],
  );

  const socket = useSocket({
    roomCode: activeRoomCode,
    speakLang,
    hearLang,
    enabled: inSession,
    onIncomingTranslation: handleIncomingTranslation,
  });

  const audio = useAudio({
    onAudioReady: socket.sendAudioChunk,
  });

  useEffect(() => {
    playAudioRef.current = audio.playAudioBase64;
  }, [audio.playAudioBase64]);

  const content = useMemo(() => {
    if (screen === "settings") {
      return (
        <SettingsScreen
          speakLang={speakLang}
          hearLang={hearLang}
          onSpeakLangChange={setSpeakLang}
          onHearLangChange={setHearLang}
          onBack={() => setScreen("home")}
        />
      );
    }

    if (screen === "session") {
      return (
        <SessionScreen
          roomCode={activeRoomCode}
          speakLang={speakLang}
          hearLang={hearLang}
          status={socket.status}
          participants={socket.participants}
          participantId={socket.participantId}
          errorMessage={socket.errorMessage}
          isRecording={audio.isRecording}
          isTranslating={socket.isTranslating}
          lastSent={socket.lastSent}
          lastReceived={socket.lastReceived}
          onStartRecording={audio.startRecording}
          onStopRecording={audio.stopRecording}
          onLeave={() => {
            socket.disconnect();
            setActiveRoomCode("");
            setScreen("home");
          }}
        />
      );
    }

    return (
      <HomeScreen
        roomCode={roomCode}
        onRoomCodeChange={(value) => setRoomCode(value.toUpperCase())}
        onCreateRoom={() => {
          const code = generateRoomCode();
          setRoomCode(code);
          setActiveRoomCode(code);
          setScreen("session");
        }}
        onJoinRoom={() => {
          setActiveRoomCode(roomCode.trim().toUpperCase());
          setScreen("session");
        }}
        onOpenSettings={() => setScreen("settings")}
      />
    );
  }, [
    activeRoomCode,
    audio.isRecording,
    audio.startRecording,
    audio.stopRecording,
    hearLang,
    roomCode,
    screen,
    socket.disconnect,
    socket.errorMessage,
    socket.isTranslating,
    socket.lastReceived,
    socket.lastSent,
    socket.participantId,
    socket.participants,
    socket.status,
    speakLang,
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
