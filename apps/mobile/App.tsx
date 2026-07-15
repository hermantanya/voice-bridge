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
  const [myLang, setMyLang] = useState<LanguageCode>("en");

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
    myLang,
    enabled: inSession,
    onIncomingTranslation: handleIncomingTranslation,
  });

  const audio = useAudio({
    onAudioReady: socket.sendAudioChunk,
    enabled: inSession,
  });

  useEffect(() => {
    playAudioRef.current = audio.playAudioBase64;
  }, [audio.playAudioBase64]);

  const handleStartRecording = useCallback(async () => {
    const claimed = await socket.claimTurn();
    if (!claimed) {
      throw new Error("Someone else started speaking first");
    }
    await audio.startRecording();
  }, [audio.startRecording, socket.claimTurn]);

  useEffect(() => {
    if (!inSession || socket.isMyTurn || socket.isOpenTurn || !audio.isRecording) {
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

  const content = useMemo(() => {
    if (screen === "settings") {
      return (
        <SettingsScreen
          myLang={myLang}
          onMyLangChange={setMyLang}
          onBack={() => setScreen("home")}
        />
      );
    }

    if (screen === "session") {
      return (
        <SessionScreen
          roomCode={activeRoomCode}
          myLang={myLang}
          partnerLang={socket.partnerLang}
          status={socket.status}
          participants={socket.participants}
          participantId={socket.participantId}
          errorMessage={socket.errorMessage}
          isRecording={audio.isRecording}
          isMyTurn={socket.isMyTurn}
          isOpenTurn={socket.isOpenTurn}
          isProcessing={socket.isProcessing}
          lastSent={socket.lastSent}
          lastReceived={socket.lastReceived}
          onStartRecording={handleStartRecording}
          onStopRecording={audio.stopRecording}
          onLeave={() => {
            audio.releaseMicrophone();
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
        myLang={myLang}
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
    audio.releaseMicrophone,
    audio.startRecording,
    audio.stopRecording,
    handleStartRecording,
    myLang,
    roomCode,
    screen,
    socket.disconnect,
    socket.errorMessage,
    socket.isMyTurn,
    socket.isOpenTurn,
    socket.isProcessing,
    socket.lastReceived,
    socket.lastSent,
    socket.partnerLang,
    socket.participantId,
    socket.participants,
    socket.status,
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
