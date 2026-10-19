import {
  AudioModule,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { handsFreeRecordingOptions } from "../session/handsFreeRecordingOptions";
import {
  isDeliverableRecording,
  resolveNativeUploadFormat,
} from "../session/nativeRecordingFormat";
import {
  nativeRecordingDurationMs,
  readNativeRecordingAsBase64,
} from "../session/readNativeRecording";
import {
  createInitialVadState,
  stepVadState,
  type VadMachineState,
} from "../session/vadStateMachine";
import { VAD_POLL_INTERVAL_MS } from "../session/vadConfig";
import { getAudioConstraints } from "../web/microphoneDevices";

type UseHandsFreeListenOptions = {
  enabled: boolean;
  selfMuted: boolean;
  participants: number;
  connected: boolean;
  selectedDeviceId?: string | null;
  onUtteranceReady: (
    audioBase64: string,
    format: string,
    recordingDurationMs: number,
    recordingStartedAt?: number,
  ) => void;
};

function webRmsToDb(samples: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i += 1) {
    sumSquares += samples[i]! * samples[i]!;
  }
  const rms = Math.sqrt(sumSquares / samples.length);
  if (rms === 0) {
    return -160;
  }
  return 20 * Math.log10(rms);
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

export function useHandsFreeListen({
  enabled,
  selfMuted,
  participants,
  connected,
  selectedDeviceId = null,
  onUtteranceReady,
}: UseHandsFreeListenOptions) {
  const onUtteranceReadyRef = useRef(onUtteranceReady);
  onUtteranceReadyRef.current = onUtteranceReady;

  const [isCapturingUtterance, setIsCapturingUtterance] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const vadStateRef = useRef<VadMachineState>(createInitialVadState());
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPollMsRef = useRef<number>(0);

  // Web
  const webStreamRef = useRef<MediaStream | null>(null);
  const webAnalyserRef = useRef<AnalyserNode | null>(null);
  const webAudioContextRef = useRef<AudioContext | null>(null);
  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const webFormatRef = useRef("webm");
  const webUtteranceStartedAtRef = useRef<number | null>(null);

  // Native
  const nativeListenRecorderRef = useRef<NativeRecorder | null>(null);
  const nativeUtteranceRecorderRef = useRef<NativeRecorder | null>(null);
  const nativeUtteranceStartedAtRef = useRef<number | null>(null);

  const shouldRun =
    enabled && connected && participants > 1 && !selfMuted;
  const shouldRunRef = useRef(shouldRun);
  shouldRunRef.current = shouldRun;

  const stopWebStream = useCallback(() => {
    webStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    webStreamRef.current = null;
    webAnalyserRef.current = null;
    if (webAudioContextRef.current) {
      void webAudioContextRef.current.close();
      webAudioContextRef.current = null;
    }
  }, []);

  const stopWebUtteranceRecorder = useCallback(() => {
    const recorder = webRecorderRef.current;
    webRecorderRef.current = null;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const deliverWebUtterance = useCallback(async (mimeType: string, format: string) => {
    const chunks = webChunksRef.current;
    webChunksRef.current = [];
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    if (blob.size === 0) {
      setIsCapturingUtterance(false);
      return;
    }

    const startedAt = webUtteranceStartedAtRef.current;
    webUtteranceStartedAtRef.current = null;
    const recordingDurationMs = startedAt
      ? Math.max(0, Date.now() - startedAt)
      : 0;

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("Could not read utterance"));
          return;
        }
        const encoded = result.split(",")[1];
        if (!encoded) {
          reject(new Error("Could not encode utterance"));
          return;
        }
        resolve(encoded);
      };
      reader.onerror = () => reject(new Error("Could not read utterance"));
      reader.readAsDataURL(blob);
    });

    if (isDeliverableRecording(base64, recordingDurationMs)) {
      onUtteranceReadyRef.current(
        base64,
        format,
        recordingDurationMs,
        startedAt ?? undefined,
      );
    }
    setIsCapturingUtterance(false);
  }, []);

  const startWebUtteranceRecorder = useCallback(() => {
    const stream = webStreamRef.current;
    if (!stream) {
      return;
    }

    const { mimeType, format } = getWebRecordingOptions();
    webFormatRef.current = format;
    webChunksRef.current = [];
    webUtteranceStartedAtRef.current = Date.now();

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    webRecorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        webChunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      void deliverWebUtterance(mimeType, format);
    };

    recorder.start(250);
    setIsCapturingUtterance(true);
  }, [deliverWebUtterance]);

  const readWebMeteringDb = useCallback((): number | undefined => {
    const analyser = webAnalyserRef.current;
    if (!analyser) {
      return undefined;
    }
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    return webRmsToDb(buffer);
  }, []);

  const readNativeMeteringDb = useCallback((): number | undefined => {
    const recorder =
      nativeUtteranceRecorderRef.current ?? nativeListenRecorderRef.current;
    if (!recorder) {
      return undefined;
    }
    return recorder.getStatus().metering;
  }, []);

  const stopNativeRecorder = useCallback(async (recorder: NativeRecorder | null) => {
    if (!recorder) {
      return;
    }
    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch {
      // ignore
    }
  }, []);

  const startNativeListenRecorder = useCallback(async () => {
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    const recording = new AudioModule.AudioRecorder(handsFreeRecordingOptions());
    await recording.prepareToRecordAsync();
    recording.record();
    nativeListenRecorderRef.current = recording;
  }, []);

  const startNativeUtteranceRecorder = useCallback(async () => {
    await stopNativeRecorder(nativeListenRecorderRef.current);
    nativeListenRecorderRef.current = null;

    const recording = new AudioModule.AudioRecorder(handsFreeRecordingOptions());
    await recording.prepareToRecordAsync();
    nativeUtteranceStartedAtRef.current = Date.now();
    recording.record();
    nativeUtteranceRecorderRef.current = recording;
    setIsCapturingUtterance(true);
  }, [stopNativeRecorder]);

  const finishNativeUtterance = useCallback(async () => {
    const recording = nativeUtteranceRecorderRef.current;
    nativeUtteranceRecorderRef.current = null;
    if (!recording) {
      setIsCapturingUtterance(false);
      return;
    }

    try {
      await recording.stop();
      await new Promise((resolve) => {
        setTimeout(resolve, 60);
      });

      const startedAt = nativeUtteranceStartedAtRef.current;
      nativeUtteranceStartedAtRef.current = null;
      const wallClockMs = startedAt ? Math.max(0, Date.now() - startedAt) : 0;
      const recordingDurationMs = nativeRecordingDurationMs(recording, wallClockMs);

      const readResult = await readNativeRecordingAsBase64(recording);
      if (readResult && isDeliverableRecording(readResult.audioBase64, recordingDurationMs)) {
        const format = resolveNativeUploadFormat(
          readResult.uri,
          readResult.audioBase64,
        );
        onUtteranceReadyRef.current(
          readResult.audioBase64,
          format,
          recordingDurationMs,
          startedAt ?? undefined,
        );
      }
    } catch (error) {
      console.warn("Could not finish hands-free utterance:", error);
    } finally {
      setIsCapturingUtterance(false);
      if (shouldRunRef.current) {
        try {
          await startNativeListenRecorder();
        } catch (error) {
          console.warn("Could not restart hands-free listen:", error);
        }
      }
    }
  }, [startNativeListenRecorder]);

  const runVadTick = useCallback(async () => {
    const nowMs = Date.now();
    const deltaMs = Math.max(
      VAD_POLL_INTERVAL_MS,
      nowMs - (lastPollMsRef.current || nowMs - VAD_POLL_INTERVAL_MS),
    );
    lastPollMsRef.current = nowMs;

    const meteringDb =
      Platform.OS === "web" ? readWebMeteringDb() : readNativeMeteringDb();

    const step = stepVadState(vadStateRef.current, {
      meteringDb,
      nowMs,
      deltaMs,
    });
    vadStateRef.current = step.state;

    if (step.startCapture) {
      if (Platform.OS === "web") {
        startWebUtteranceRecorder();
      } else {
        void startNativeUtteranceRecorder();
      }
    }

    if (step.endCapture) {
      if (Platform.OS === "web") {
        stopWebUtteranceRecorder();
      } else {
        void finishNativeUtterance();
      }
    }
  }, [
    finishNativeUtterance,
    readNativeMeteringDb,
    readWebMeteringDb,
    startNativeUtteranceRecorder,
    startWebUtteranceRecorder,
    stopWebUtteranceRecorder,
  ]);

  const teardown = useCallback(async () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    vadStateRef.current = createInitialVadState();
    lastPollMsRef.current = 0;
    setIsListening(false);
    setIsCapturingUtterance(false);

    stopWebUtteranceRecorder();
    stopWebStream();
    webChunksRef.current = [];
    webUtteranceStartedAtRef.current = null;

    await stopNativeRecorder(nativeUtteranceRecorderRef.current);
    await stopNativeRecorder(nativeListenRecorderRef.current);
    nativeUtteranceRecorderRef.current = null;
    nativeListenRecorderRef.current = null;
    nativeUtteranceStartedAtRef.current = null;
  }, [stopNativeRecorder, stopWebStream, stopWebUtteranceRecorder]);

  const setup = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Microphone permission is required.");
    }

    if (Platform.OS === "web") {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microphone is not available in this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia(
        getAudioConstraints(selectedDeviceId, Boolean(selectedDeviceId)),
      );
      webStreamRef.current = stream;

      const ctx = new AudioContext();
      webAudioContextRef.current = ctx;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      webAnalyserRef.current = analyser;
      setIsListening(true);
      return;
    }

    await startNativeListenRecorder();
    setIsListening(true);
  }, [selectedDeviceId, startNativeListenRecorder]);

  useEffect(() => {
    if (!shouldRun) {
      void teardown();
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        await setup();
      } catch (error) {
        console.warn("Hands-free listen setup failed:", error);
        if (!cancelled) {
          await teardown();
        }
        return;
      }

      if (cancelled) {
        await teardown();
        return;
      }

      lastPollMsRef.current = Date.now();
      pollTimerRef.current = setInterval(() => {
        void runVadTick();
      }, VAD_POLL_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      void teardown();
    };
  }, [runVadTick, setup, shouldRun, teardown]);

  return {
    isListening: shouldRun && isListening,
    isCapturingUtterance,
  };
}
