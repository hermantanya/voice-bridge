import { Audio } from "expo-av";
import { Platform } from "react-native";

export async function playVoicePreviewAudio(audioBase64: string): Promise<void> {
  if (!audioBase64.trim()) {
    throw new Error("Preview audio is empty.");
  }

  if (Platform.OS === "web") {
    const audio = new window.Audio(`data:audio/mp3;base64,${audioBase64}`);
    await audio.play();
    return;
  }

  await Audio.setAudioModeAsync({
    allowsRecordingIOS: false,
    playsInSilentModeIOS: true,
  });

  const { sound } = await Audio.Sound.createAsync(
    { uri: `data:audio/mp3;base64,${audioBase64}` },
    { shouldPlay: true },
  );

  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      void sound.unloadAsync();
    }
  });
}
