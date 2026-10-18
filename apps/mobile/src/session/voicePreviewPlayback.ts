import { Platform } from "react-native";

import { playNativeMp3Base64 } from "./nativeMp3Playback";

export async function playVoicePreviewAudio(audioBase64: string): Promise<void> {
  if (!audioBase64.trim()) {
    throw new Error("Preview audio is empty.");
  }

  if (Platform.OS === "web") {
    const audio = new window.Audio(`data:audio/mp3;base64,${audioBase64}`);
    await audio.play();
    return;
  }

  await playNativeMp3Base64(audioBase64);
}
