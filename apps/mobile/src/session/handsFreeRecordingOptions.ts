import type { RecordingOptions } from "expo-audio";

import { pushToTalkRecordingOptions } from "./pushToTalkRecordingOptions";

/** Same containers as PTT (iOS WAV for Whisper); metering enabled for VAD. */
export function handsFreeRecordingOptions(): RecordingOptions {
  return {
    ...pushToTalkRecordingOptions(),
    isMeteringEnabled: true,
  };
}
