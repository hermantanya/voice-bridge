import { Audio } from "expo-av";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useCallback, useRef, useState } from "react";
import { Platform } from "react-native";

type UseAudioOptions = {
  onAudioReady: (audioBase64: string, format: string) => void;
};

export function useAudio({ onAudioReady }: UseAudioOptions) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );

  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    const permission = await Audio.requestPermissionsAsync();
    const granted = permission.granted;
    setPermissionGranted(granted);
    return granted;
  }, []);

  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      throw new Error("Use your phone for push-to-talk. Web recording is not supported yet.");
    }

    const granted = await ensurePermissions();
    if (!granted) {
      throw new Error("Microphone permission is required.");
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
    );
    await recording.startAsync();

    recordingRef.current = recording;
    setIsRecording(true);
  }, [ensurePermissions]);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) {
      return;
    }

    setIsRecording(false);
    recordingRef.current = null;

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    if (!uri) {
      throw new Error("Recording failed — no audio captured.");
    }

    const audioBase64 = await readAsStringAsync(uri, {
      encoding: "base64",
    });

    const format = uri.endsWith(".caf") ? "caf" : "m4a";
    onAudioReady(audioBase64, format);
  }, [onAudioReady]);

  const playAudioBase64 = useCallback(async (audioBase64: string) => {
    if (Platform.OS === "web") {
      const audio = new window.Audio(`data:audio/mp3;base64,${audioBase64}`);
      await audio.play();
      return;
    }

    if (soundRef.current) {
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
    });

    const { sound } = await Audio.Sound.createAsync(
      { uri: `data:audio/mp3;base64,${audioBase64}` },
      { shouldPlay: true },
    );

    soundRef.current = sound;
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync();
        soundRef.current = null;
      }
    });
  }, []);

  return {
    isRecording,
    permissionGranted,
    startRecording,
    stopRecording,
    playAudioBase64,
    ensurePermissions,
  };
}
