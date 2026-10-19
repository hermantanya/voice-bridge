/** dBFS from expo-audio metering (-160 = silence). */
export const VAD_SPEECH_LEVEL_DB = -42;

export const VAD_SILENCE_LEVEL_DB = -48;

/** Consecutive speech frames required before utterance capture starts. */
export const VAD_SPEECH_START_MS = 280;

/** Trailing silence before an utterance is sent. */
export const VAD_SILENCE_END_MS = 750;

/** Hard cap per utterance (server also validates duration). */
export const VAD_MAX_UTTERANCE_MS = 30_000;

export const VAD_POLL_INTERVAL_MS = 100;

export function isSpeechLevel(meteringDb: number | undefined): boolean {
  if (meteringDb === undefined || Number.isNaN(meteringDb)) {
    return false;
  }
  return meteringDb >= VAD_SPEECH_LEVEL_DB;
}

export function isSilenceLevel(meteringDb: number | undefined): boolean {
  if (meteringDb === undefined || Number.isNaN(meteringDb)) {
    return true;
  }
  return meteringDb <= VAD_SILENCE_LEVEL_DB;
}
