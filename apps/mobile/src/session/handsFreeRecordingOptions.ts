import type { RecordingOptions } from "expo-audio";

import { pushToTalkRecordingOptions } from "./pushToTalkRecordingOptions";

/** Continuous listen pass — metering for VAD; same Whisper-safe container as PTT on iOS. */
export function handsFreeListenRecordingOptions(): RecordingOptions {
  return {
    ...pushToTalkRecordingOptions(),
    isMeteringEnabled: true,
  };
}

/** Utterance capture must match PTT exactly (16 kHz mono WAV on iOS). */
export function handsFreeUtteranceRecordingOptions(): RecordingOptions {
  return pushToTalkRecordingOptions();
}

/** @deprecated use handsFreeListenRecordingOptions or handsFreeUtteranceRecordingOptions */
export function handsFreeRecordingOptions(): RecordingOptions {
  return handsFreeListenRecordingOptions();
}
