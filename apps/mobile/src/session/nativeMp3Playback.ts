import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";

export async function playNativeMp3Base64(
  audioBase64: string,
  activePlayerRef?: { current: AudioPlayer | null },
): Promise<void> {
  await setAudioModeAsync({
    allowsRecording: false,
    playsInSilentMode: true,
  });

  if (activePlayerRef?.current) {
    activePlayerRef.current.remove();
    activePlayerRef.current = null;
  }

  const player = createAudioPlayer({
    uri: `data:audio/mp3;base64,${audioBase64}`,
  });

  if (activePlayerRef) {
    activePlayerRef.current = player;
  }

  const subscription = player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) {
      subscription.remove();
      player.remove();
      if (activePlayerRef?.current === player) {
        activePlayerRef.current = null;
      }
    }
  });

  player.play();
}
