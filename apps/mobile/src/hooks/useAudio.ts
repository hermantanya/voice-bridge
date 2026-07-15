import { Audio } from "expo-av";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

type UseAudioOptions = {
  onAudioReady: (audioBase64: string, format: string) => void;
  enabled?: boolean;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Could not read recorded audio."));
        return;
      }

      const base64 = result.split(",")[1];
      if (!base64) {
        reject(new Error("Could not encode recorded audio."));
        return;
      }

      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Could not read recorded audio."));
    reader.readAsDataURL(blob);
  });
}

function getWebRecordingOptions(): { mimeType: string; format: string } {
  const candidates = [
    { mimeType: "audio/webm;codecs=opus", format: "webm" },
    { mimeType: "audio/webm", format: "webm" },
    { mimeType: "audio/mp4", format: "mp4" },
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate.mimeType)) {
      return candidate;
    }
  }

  return { mimeType: "", format: "webm" };
}

export function useAudio({ onAudioReady, enabled = true }: UseAudioOptions) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webFormatRef = useRef("webm");
  const webSessionRef = useRef(0);
  const webStartInProgressRef = useRef(false);
  const webStopRequestedRef = useRef(false);
  const onAudioReadyRef = useRef(onAudioReady);

  const [isRecording, setIsRecording] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );

  onAudioReadyRef.current = onAudioReady;

  const stopMediaStream = useCallback((stream: MediaStream | null | undefined) => {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

  const resetWebRecordingState = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current ?? pendingStreamRef.current;

    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    pendingStreamRef.current = null;
    webChunksRef.current = [];
    webStartInProgressRef.current = false;
    webStopRequestedRef.current = false;
    setIsRecording(false);

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // Ignore stop errors and clean up tracks below.
      }
    }

    stopMediaStream(stream);
  }, [stopMediaStream]);

  const ensurePermissions = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermissionGranted(false);
        return false;
      }

      if (permissionGranted === true) {
        return true;
      }

      if (permissionGranted === false) {
        return false;
      }

      try {
        if (navigator.permissions?.query) {
          const status = await navigator.permissions.query({
            name: "microphone" as PermissionName,
          });

          if (status.state === "granted") {
            setPermissionGranted(true);
            return true;
          }

          if (status.state === "denied") {
            setPermissionGranted(false);
            return false;
          }
        }
      } catch {
        // Fall through to the first hold-to-talk attempt.
      }

      return true;
    }

    const permission = await Audio.requestPermissionsAsync();
    const granted = permission.granted;
    setPermissionGranted(granted);
    return granted;
  }, [permissionGranted]);

  const startRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      if (webStartInProgressRef.current) {
        return;
      }

      if (mediaRecorderRef.current) {
        resetWebRecordingState();
      }

      webStartInProgressRef.current = true;
      webStopRequestedRef.current = false;
      const sessionId = webSessionRef.current + 1;
      webSessionRef.current = sessionId;

      try {
        const granted = await ensurePermissions();
        if (!granted) {
          throw new Error("Microphone permission is required.");
        }

        if (webStopRequestedRef.current || sessionId !== webSessionRef.current) {
          return;
        }

        const { mimeType, format } = getWebRecordingOptions();
        let stream: MediaStream;

        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          setPermissionGranted(true);
        } catch {
          setPermissionGranted(false);
          throw new Error("Microphone permission is required.");
        }

        pendingStreamRef.current = stream;

        if (webStopRequestedRef.current || sessionId !== webSessionRef.current) {
          stopMediaStream(stream);
          pendingStreamRef.current = null;
          return;
        }

        const recorder = new MediaRecorder(
          stream,
          mimeType ? { mimeType } : undefined,
        );
        const chunks: Blob[] = [];
        webChunksRef.current = chunks;
        webFormatRef.current = format;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        recorder.onerror = () => {
          if (sessionId === webSessionRef.current) {
            resetWebRecordingState();
          }
        };

        recorder.onstop = () => {
          stopMediaStream(stream);

          if (mediaRecorderRef.current === recorder) {
            mediaRecorderRef.current = null;
            mediaStreamRef.current = null;
          }
          pendingStreamRef.current = null;

          if (sessionId !== webSessionRef.current) {
            setIsRecording(false);
            return;
          }

          setIsRecording(false);

          void (async () => {
            const blob = new Blob(chunks, {
              type: mimeType || "audio/webm",
            });

            if (blob.size === 0) {
              return;
            }

            const audioBase64 = await blobToBase64(blob);
            onAudioReadyRef.current(audioBase64, format);
          })();
        };

        mediaStreamRef.current = stream;
        pendingStreamRef.current = null;
        mediaRecorderRef.current = recorder;
        recorder.start(250);

        if (webStopRequestedRef.current) {
          recorder.stop();
        } else {
          setIsRecording(true);
        }
      } finally {
        webStartInProgressRef.current = false;
      }
      return;
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
  }, [ensurePermissions, resetWebRecordingState, stopMediaStream]);

  const stopRecording = useCallback(async () => {
    if (Platform.OS === "web") {
      webStopRequestedRef.current = true;
      setIsRecording(false);

      if (webStartInProgressRef.current) {
        stopMediaStream(
          pendingStreamRef.current ?? mediaStreamRef.current,
        );
        pendingStreamRef.current = null;
        mediaStreamRef.current = null;
        return;
      }

      const recorder = mediaRecorderRef.current;
      const stream = mediaStreamRef.current ?? pendingStreamRef.current;

      if (!recorder) {
        stopMediaStream(stream);
        resetWebRecordingState();
        return;
      }

      if (recorder.state === "inactive") {
        stopMediaStream(stream);
        resetWebRecordingState();
        return;
      }

      try {
        if (recorder.state === "recording") {
          recorder.requestData();
        }
        recorder.stop();
      } catch {
        resetWebRecordingState();
      } finally {
        stopMediaStream(stream);
        if (mediaRecorderRef.current === recorder) {
          mediaStreamRef.current = null;
        }
        pendingStreamRef.current = null;
      }
      return;
    }

    const recording = recordingRef.current;
    if (!recording) {
      setIsRecording(false);
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
    onAudioReadyRef.current(audioBase64, format);
  }, [resetWebRecordingState, stopMediaStream]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    if (!enabled) {
      resetWebRecordingState();
    }
  }, [enabled, resetWebRecordingState]);

  useEffect(() => {
    if (Platform.OS !== "web") {
      return;
    }

    const releaseMic = () => {
      resetWebRecordingState();
    };

    window.addEventListener("pagehide", releaseMic);
    window.addEventListener("beforeunload", releaseMic);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        releaseMic();
      }
    });

    return () => {
      releaseMic();
      window.removeEventListener("pagehide", releaseMic);
      window.removeEventListener("beforeunload", releaseMic);
    };
  }, [resetWebRecordingState]);

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
    releaseMicrophone: resetWebRecordingState,
    playAudioBase64,
    ensurePermissions,
  };
}
