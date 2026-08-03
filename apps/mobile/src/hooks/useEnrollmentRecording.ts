import { Audio } from "expo-av";
import { readAsStringAsync } from "expo-file-system/legacy";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

export type EnrollmentRecordingResult = {
  audioBase64: string;
  format: string;
  durationMs: number;
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

export function useEnrollmentRecording() {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webFormatRef = useRef("webm");
  const startedAtRef = useRef<number | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = setInterval(() => {
      if (startedAtRef.current) {
        setElapsedMs(Date.now() - startedAtRef.current);
      }
    }, 250);

    return () => clearInterval(timer);
  }, [isRecording]);

  const ensurePermissions = useCallback(async () => {
    if (Platform.OS === "web") {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone is not available in this browser.");
      }
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Microphone permission is required.");
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    await ensurePermissions();

    if (Platform.OS === "web") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      webChunksRef.current = [];

      const { mimeType, format } = getWebRecordingOptions();
      webFormatRef.current = format;

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          webChunksRef.current.push(event.data);
        }
      };

      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setIsRecording(true);
      return;
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
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setIsRecording(true);
  }, [ensurePermissions]);

  const stopRecording =
    useCallback(async (): Promise<EnrollmentRecordingResult | null> => {
      const startedAt = startedAtRef.current;
      startedAtRef.current = null;
      setIsRecording(false);

      if (!startedAt) {
        return null;
      }

      const durationMs = Date.now() - startedAt;
      setElapsedMs(durationMs);

      if (Platform.OS === "web") {
        const recorder = mediaRecorderRef.current;
        mediaRecorderRef.current = null;

        if (!recorder || recorder.state === "inactive") {
          mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
          mediaStreamRef.current = null;
          return null;
        }

        const mimeType = recorder.mimeType || "audio/webm";
        const format = webFormatRef.current;

        const blob = await new Promise<Blob>((resolve, reject) => {
          recorder.onstop = () => {
            resolve(new Blob(webChunksRef.current, { type: mimeType }));
          };
          recorder.onerror = () =>
            reject(new Error("Could not finish web recording."));
          recorder.stop();
        });

        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        webChunksRef.current = [];

        if (blob.size === 0) {
          return null;
        }

        return {
          audioBase64: await blobToBase64(blob),
          format,
          durationMs,
        };
      }

      const recording = recordingRef.current;
      recordingRef.current = null;

      if (!recording) {
        return null;
      }

      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (!uri) {
        return null;
      }

      const audioBase64 = await readAsStringAsync(uri, {
        encoding: "base64",
      });

      return {
        audioBase64,
        format: uri.endsWith(".caf") ? "caf" : "m4a",
        durationMs,
      };
    }, []);

  const resetRecording = useCallback(() => {
    setElapsedMs(0);
    setError(null);
    startedAtRef.current = null;
    setIsRecording(false);
  }, []);

  return {
    isRecording,
    elapsedMs,
    error,
    setError,
    startRecording,
    stopRecording,
    resetRecording,
  };
}
