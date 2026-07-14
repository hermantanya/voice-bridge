import { useMemo, useState } from "react";
import { SafeAreaView, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

import type { LanguageCode } from "./src/config";
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

  const socket = useSocket({
    roomCode: activeRoomCode,
    speakLang,
    hearLang,
    enabled: inSession,
  });

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
    hearLang,
    roomCode,
    screen,
    socket.disconnect,
    socket.errorMessage,
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
