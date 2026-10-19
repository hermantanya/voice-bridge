import {
  VAD_MAX_UTTERANCE_MS,
  VAD_SILENCE_END_MS,
  VAD_SPEECH_START_MS,
  isSilenceLevel,
  isSpeechLevel,
} from "./vadConfig";

export type VadPhase = "listening" | "capturing";

export type VadMachineState = {
  phase: VadPhase;
  speechAboveMs: number;
  silenceBelowMs: number;
  captureStartedAtMs: number | null;
};

export function createInitialVadState(): VadMachineState {
  return {
    phase: "listening",
    speechAboveMs: 0,
    silenceBelowMs: 0,
    captureStartedAtMs: null,
  };
}

export type VadStepResult = {
  state: VadMachineState;
  /** Begin recording an utterance (web may start MediaRecorder here). */
  startCapture: boolean;
  /** End recording and send (caller stops recorder and uploads). */
  endCapture: boolean;
  endReason: "silence" | "max_duration" | null;
};

export function stepVadState(
  prev: VadMachineState,
  input: { meteringDb: number | undefined; nowMs: number; deltaMs: number },
): VadStepResult {
  let state: VadMachineState = {
    ...prev,
    speechAboveMs: prev.speechAboveMs,
    silenceBelowMs: prev.silenceBelowMs,
  };
  let startCapture = false;
  let endCapture = false;
  let endReason: VadStepResult["endReason"] = null;

  const { meteringDb, nowMs, deltaMs } = input;

  if (state.phase === "listening") {
    if (isSpeechLevel(meteringDb)) {
      state.speechAboveMs += deltaMs;
      state.silenceBelowMs = 0;
      if (state.speechAboveMs >= VAD_SPEECH_START_MS) {
        state.phase = "capturing";
        state.captureStartedAtMs = nowMs;
        state.silenceBelowMs = 0;
        startCapture = true;
      }
    } else {
      state.speechAboveMs = 0;
    }
    return { state, startCapture, endCapture, endReason };
  }

  // capturing
  const captureStartedAt = state.captureStartedAtMs ?? nowMs;
  const captureDurationMs = nowMs - captureStartedAt;

  if (captureDurationMs >= VAD_MAX_UTTERANCE_MS) {
    endCapture = true;
    endReason = "max_duration";
    state = createInitialVadState();
    return { state, startCapture, endCapture, endReason };
  }

  if (isSilenceLevel(meteringDb)) {
    state.silenceBelowMs += deltaMs;
    state.speechAboveMs = 0;
    if (state.silenceBelowMs >= VAD_SILENCE_END_MS) {
      endCapture = true;
      endReason = "silence";
      state = createInitialVadState();
    }
  } else {
    state.silenceBelowMs = 0;
    if (isSpeechLevel(meteringDb)) {
      state.speechAboveMs += deltaMs;
    }
  }

  return { state, startCapture, endCapture, endReason };
}
