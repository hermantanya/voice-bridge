import {
  AudioModule,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import {
  isDeliverableRecording,
  resolveNativeUploadFormat,
} from "../session/nativeRecordingFormat";
import { releaseHandsFreeMicBeforePushToTalk } from "../session/nativeMicCoordinator";
import { pushToTalkRecordingOptions } from "../session/pushToTalkRecordingOptions";
import {
  nativeRecordingDurationMs,
  readNativeRecordingAsBase64,
} from "../session/readNativeRecording";
import { playNativeMp3Base64 } from "../session/nativeMp3Playback";
import {
  clearSavedMicDeviceId,
  enumerateMicrophones,
  getAudioConstraints,
  loadSavedMicDeviceId,
  preferBuiltInMic,
  saveMicDeviceId,
  type MicrophoneDevice,
} from "../web/microphoneDevices";
import {
  startStreamingPcmCapture,
  type StreamingPcmCapture,
} from "../web/streamingPcmCapture";

type UseAudioOptions = {
  onAudioReady: (
    audioBase64: string,
    format: string,
    recordingDurationMs: number,
  ) => void;
  enabled?: boolean;
  /** Web-only streaming uplink during hold (PCM16 chunks). */
  streamingUplinkEnabled?: boolean;
  onStreamingChunk?: (audioBase64: string, format: string) => void;
  onStreamingRecordingStarted?: () => void | Promise<void>;
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

type NativeRecorder = InstanceType<typeof AudioModule.AudioRecorder>;

export function useAudio({
  onAudioReady,
  enabled = true,
  streamingUplinkEnabled = false,
  onStreamingChunk,
  onStreamingRecordingStarted,
}: UseAudioOptions) {
  const recordingRef = useRef<NativeRecorder | null>(null);
  const soundRef = useRef<AudioPlayer | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pendingStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webFormatRef = useRef("webm");
  const webSessionRef = useRef(0);
  const webStartInProgressRef = useRef(false);
  const webStopRequestedRef = useRef(false);
  const nativeStopRequestedRef = useRef(false);
  const pendingStopResolveRef = useRef<((delivered: boolean) => void) | null>(
    null,
  );
  const recordingStartedAtRef = useRef<number | null>(null);
  const onAudioReadyRef = useRef(onAudioReady);
  const onStreamingChunkRef = useRef(onStreamingChunk);
  const onStreamingRecordingStartedRef = useRef(onStreamingRecordingStarted);
  const streamingCaptureRef = useRef<StreamingPcmCapture | null>(null);
  const enabledRef = useRef(enabled);
  const streamingUplinkEnabledRef = useRef(streamingUplinkEnabled);
  enabledRef.current = enabled;
  streamingUplinkEnabledRef.current = streamingUplinkEnabled;
  onStreamingChunkRef.current = onStreamingChunk;
  onStreamingRecordingStartedRef.current = onStreamingRecordingStarted;

  const [isRecording, setIsRecording] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(
    null,
  );
  const [inputDevices, setInputDevices] = useState<MicrophoneDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(
    () => (Platform.OS === "web" ? loadSavedMicDeviceId() : null),
  );

  onAudioReadyRef.current = onAudioReady;

  const stopMediaStream = useCallback((stream: MediaStream | null | undefined) => {
    stream?.getTracks().forEach((track) => {
      track.stop();
    });
  }, []);

  const resetWebRecordingState = useCallback(() => {
    webSessionRef.current += 1;

    const recorder = mediaRecorderRef.current;
    const stream = mediaStreamRef.current ?? pendingStreamRef.current;

    mediaRecorderRef.current = null;
    mediaStreamRef.current = null;
    pendingStreamRef.current = null;
    webChunksRef.current = [];
    webStartInProgressRef.current = false;
    webStopRequestedRef.current = false;
    nativeStopRequestedRef.current = false;
    pendingStopResolveRef.current?.(false);
    pendingStopResolveRef.current = null;
    recordingStartedAtRef.current = null;
    streamingCaptureRef.current?.stop();
    streamingCaptureRef.current = null;
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

  const resolveMicDeviceId = useCallback((): string | null => {
    if (selectedDeviceId) {
      return selectedDeviceId;
    }

    return preferBuiltInMic(inputDevices)?.deviceId ?? null;
  }, [inputDevices, selectedDeviceId]);

  const refreshInputDevices = useCallback(async (requestLabels = false) => {
    if (Platform.OS !== "web") {
      return;
    }

    let devices = await enumerateMicrophones();
    const labelsHidden = devices.some(
      (device) => !device.label || /^Microphone \d+$/.test(device.label),
    );

    if (requestLabels && devices.length > 0 && labelsHidden) {
      try {
        const probe = await navigator.mediaDevices.getUserMedia(
          getAudioConstraints(null),
        );
        probe.getTracks().forEach((track) => {
          track.stop();
        });
        devices = await enumerateMicrophones();
        setPermissionGranted(true);
      } catch {
        setPermissionGranted(false);
      }
    }

    setInputDevices(devices);

    const saved = loadSavedMicDeviceId();
    if (saved && devices.some((device) => device.deviceId === saved)) {
      setSelectedDeviceIdState(saved);
      return;
    }

    if (saved) {
      clearSavedMicDeviceId();
    }

    const preferred = preferBuiltInMic(devices);
    if (preferred) {
      setSelectedDeviceIdState(preferred.deviceId);
      saveMicDeviceId(preferred.deviceId);
    } else {
      setSelectedDeviceIdState(null);
    }
  }, []);

  const setSelectedDeviceId = useCallback(
    (deviceId: string) => {
      saveMicDeviceId(deviceId);
      setSelectedDeviceIdState(deviceId);
      resetWebRecordingState();
    },
    [resetWebRecordingState],
  );

  const attachStreamLifecycle = useCallback(
    (stream: MediaStream) => {
      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (
            mediaStreamRef.current === stream ||
            pendingStreamRef.current === stream
          ) {
            resetWebRecordingState();
          }
        });
      });
    },
    [resetWebRecordingState],
  );

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

    const permission = await requestRecordingPermissionsAsync();
    const granted = permission.granted;
    setPermissionGranted(granted);
    return granted;
  }, [permissionGranted]);

  const deliverRecording = useCallback(
    (
      audioBase64: string,
      format: string,
      recordingDurationMs: number,
    ): boolean => {
      recordingStartedAtRef.current = null;

      if (!isDeliverableRecording(audioBase64, recordingDurationMs)) {
        return false;
      }

      onAudioReadyRef.current(audioBase64, format, recordingDurationMs);
      return true;
    },
    [],
  );

  const startRecording = useCallback(async () => {
    if (!enabledRef.current) {
      return;
    }

    if (Platform.OS === "web") {
      recordingStartedAtRef.current = Date.now();
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
        const micDeviceId = resolveMicDeviceId();
        const useExactDevice = Boolean(selectedDeviceId);

        try {
          stream = await navigator.mediaDevices.getUserMedia(
            getAudioConstraints(micDeviceId, useExactDevice),
          );
          attachStreamLifecycle(stream);
          setPermissionGranted(true);
          await refreshInputDevices(true);
        } catch (error) {
          if (
            micDeviceId &&
            error instanceof DOMException &&
            (error.name === "NotFoundError" || error.name === "OverconstrainedError")
          ) {
            clearSavedMicDeviceId();
            setSelectedDeviceIdState(null);
            stream = await navigator.mediaDevices.getUserMedia(
              getAudioConstraints(null),
            );
            attachStreamLifecycle(stream);
            setPermissionGranted(true);
            await refreshInputDevices(true);
          } else {
            setPermissionGranted(false);
            throw new Error("Microphone permission is required.");
          }
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
            recordingStartedAtRef.current = null;
            pendingStopResolveRef.current?.(false);
            pendingStopResolveRef.current = null;
            return;
          }

          const startedAt = recordingStartedAtRef.current;
          const recordingDurationMs = startedAt
            ? Math.max(0, Date.now() - startedAt)
            : 0;
          const audioBase64 = await blobToBase64(blob);
          const delivered = deliverRecording(
            audioBase64,
            format,
            recordingDurationMs,
          );
          pendingStopResolveRef.current?.(delivered);
          pendingStopResolveRef.current = null;
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
          void (async () => {
            try {
              await onStreamingRecordingStartedRef.current?.();
            } catch (error) {
              console.warn("Streaming PTT session start failed:", error);
            }
            if (
              sessionId !== webSessionRef.current ||
              webStopRequestedRef.current ||
              !streamingUplinkEnabledRef.current ||
              !onStreamingChunkRef.current
            ) {
              return;
            }
            streamingCaptureRef.current?.stop();
            streamingCaptureRef.current = startStreamingPcmCapture(
              stream,
              (pcm16Base64) => {
                onStreamingChunkRef.current?.(pcm16Base64, "pcm16");
              },
            );
          })();
        }
      } finally {
        webStartInProgressRef.current = false;
      }
      return;
    }

    nativeStopRequestedRef.current = false;
    recordingStartedAtRef.current = Date.now();

    await releaseHandsFreeMicBeforePushToTalk();
    if (!enabledRef.current || nativeStopRequestedRef.current) {
      recordingStartedAtRef.current = null;
      return;
    }

    const granted = await ensurePermissions();
    if (!granted) {
      recordingStartedAtRef.current = null;
      throw new Error("Microphone permission is required.");
    }

    if (nativeStopRequestedRef.current) {
      recordingStartedAtRef.current = null;
      return;
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    if (nativeStopRequestedRef.current) {
      recordingStartedAtRef.current = null;
      return;
    }

    const recording = new AudioModule.AudioRecorder(pushToTalkRecordingOptions());
    await recording.prepareToRecordAsync();

    if (nativeStopRequestedRef.current) {
      try {
        await recording.stop();
      } catch {
        // Recording never started.
      }
      recordingStartedAtRef.current = null;
      return;
    }

    recording.record();

    if (nativeStopRequestedRef.current) {
      try {
        await recording.stop();
      } catch {
        // Ignore stop errors for cancelled starts.
      }
      recordingStartedAtRef.current = null;
      return;
    }

    recordingRef.current = recording;
    setIsRecording(true);
  }, [
    attachStreamLifecycle,
    deliverRecording,
    ensurePermissions,
    refreshInputDevices,
    resetWebRecordingState,
    resolveMicDeviceId,
    selectedDeviceId,
    stopMediaStream,
  ]);

  const stopRecording = useCallback(async (): Promise<boolean> => {
    if (Platform.OS === "web") {
      webStopRequestedRef.current = true;
      setIsRecording(false);

      if (webStartInProgressRef.current) {
        stopMediaStream(
          pendingStreamRef.current ?? mediaStreamRef.current,
        );
        pendingStreamRef.current = null;
        mediaStreamRef.current = null;
        return false;
      }

      const recorder = mediaRecorderRef.current;
      const stream = mediaStreamRef.current ?? pendingStreamRef.current;

      if (!recorder) {
        stopMediaStream(stream);
        resetWebRecordingState();
        return false;
      }

      if (recorder.state === "inactive") {
        stopMediaStream(stream);
        resetWebRecordingState();
        return false;
      }

      return await new Promise<boolean>((resolve) => {
        pendingStopResolveRef.current = resolve;

        try {
          if (recorder.state === "recording") {
            recorder.requestData();
          }
          recorder.stop();
        } catch {
          pendingStopResolveRef.current = null;
          resetWebRecordingState();
          resolve(false);
          return;
        } finally {
          stopMediaStream(stream);
          if (mediaRecorderRef.current === recorder) {
            mediaStreamRef.current = null;
          }
          pendingStreamRef.current = null;
        }
      });
    }

    const recording = recordingRef.current;
    nativeStopRequestedRef.current = true;
    if (!recording) {
      setIsRecording(false);
      nativeStopRequestedRef.current = false;
      return false;
    }

    setIsRecording(false);
    recordingRef.current = null;

    try {
      await recording.stop();
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      const startedAt = recordingStartedAtRef.current;
      const wallClockMs = startedAt
        ? Math.max(0, Date.now() - startedAt)
        : 0;
      const recordingDurationMs = nativeRecordingDurationMs(
        recording,
        wallClockMs,
      );

      const readResult = await readNativeRecordingAsBase64(recording);
      if (!readResult) {
        recordingStartedAtRef.current = null;
        return false;
      }

      const format = resolveNativeUploadFormat(
        readResult.uri,
        readResult.audioBase64,
      );
      return deliverRecording(
        readResult.audioBase64,
        format,
        recordingDurationMs,
      );
    } finally {
      nativeStopRequestedRef.current = false;
    }
  }, [deliverRecording, resetWebRecordingState, stopMediaStream]);

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

    void refreshInputDevices(false);

    const handleDeviceChange = () => {
      resetWebRecordingState();
      void refreshInputDevices(false);
    };

    navigator.mediaDevices?.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [refreshInputDevices, resetWebRecordingState]);

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
    if (!audioBase64.trim()) {
      return;
    }

    if (Platform.OS === "web") {
      const audio = new window.Audio(`data:audio/mp3;base64,${audioBase64}`);
      try {
        await audio.play();
      } catch (error) {
        console.warn("Web translation playback blocked or failed:", error);
        throw error;
      }
      return;
    }

    await playNativeMp3Base64(audioBase64, soundRef);
  }, []);

  return {
    isRecording,
    permissionGranted,
    inputDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshInputDevices,
    startRecording,
    stopRecording,
    releaseMicrophone: resetWebRecordingState,
    playAudioBase64,
    ensurePermissions,
  };
}
