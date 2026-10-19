/** Minimum decoded audio size before calling Whisper (avoids empty/corrupt uploads). */
export const MIN_AUDIO_BYTES = 512;
/** Keep aligned with apps/mobile/src/session/nativeRecordingFormat.ts */
export const MIN_RECORDING_DURATION_MS = 200;

const WHISPER_FORMATS = new Set([
  "webm",
  "wav",
  "mp3",
  "m4a",
  "mp4",
  "mpeg",
  "mpga",
  "oga",
  "ogg",
  "flac",
  "caf",
]);

/**
 * Maps client-reported extensions to Whisper-compatible file extensions.
 */
export function normalizeAudioFormat(format: string | undefined): string {
  const raw = (format ?? "webm").trim().toLowerCase().replace(/^\./, "");
  if (raw === "caf" || raw === "x-caf") {
    return "caf";
  }
  if (raw === "3gp" || raw === "3gpp") {
    return "3gp";
  }
  if (WHISPER_FORMATS.has(raw)) {
    return raw;
  }
  return "webm";
}

export function mimeTypeForAudioFormat(format: string): string {
  switch (format) {
    case "webm":
      return "audio/webm";
    case "wav":
      return "audio/wav";
    case "mp3":
    case "mpeg":
    case "mpga":
      return "audio/mpeg";
    case "m4a":
    case "mp4":
      return "audio/mp4";
    case "3gp":
      return "audio/3gpp";
    case "ogg":
    case "oga":
      return "audio/ogg";
    case "flac":
      return "audio/flac";
    case "caf":
      return "audio/x-caf";
    default:
      return "audio/webm";
  }
}

/** Prefer container magic over client extension (iOS often mislabels CAF as m4a). */
export function detectAudioFormatFromBuffer(audio: Buffer): string | null {
  if (audio.length < 12) {
    return null;
  }

  if (audio.subarray(0, 4).toString("ascii") === "caff") {
    return "caf";
  }

  if (audio.subarray(4, 8).toString("ascii") === "ftyp") {
    return "m4a";
  }

  if (
    audio.subarray(0, 4).toString("ascii") === "RIFF" &&
    audio.subarray(8, 12).toString("ascii") === "WAVE"
  ) {
    return "wav";
  }

  if (
    audio[0] === 0x1a &&
    audio[1] === 0x45 &&
    audio[2] === 0xdf &&
    audio[3] === 0xa3
  ) {
    return "webm";
  }

  if (
    audio.subarray(0, 3).toString("ascii") === "ID3" ||
    (audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0)
  ) {
    return "mp3";
  }

  return null;
}

export function resolveWhisperUploadFormat(
  audio: Buffer,
  clientFormat: string | undefined,
): string {
  const fromClient = normalizeAudioFormat(clientFormat);
  const fromBuffer = detectAudioFormatFromBuffer(audio);

  if (!fromBuffer) {
    return fromClient;
  }

  if (fromClient === fromBuffer) {
    return fromClient;
  }

  // CAF bytes labeled m4a/mp4 (or the reverse) must follow the container.
  if (fromBuffer === "caf" || fromClient === "caf") {
    return fromBuffer;
  }

  return fromBuffer;
}

export function validateAudioBuffer(audio: Buffer): string | null {
  if (audio.length < MIN_AUDIO_BYTES) {
    return "Recording too short. Hold the button a little longer and try again.";
  }
  return null;
}


export function validateRecordingDurationMs(durationMs: number): string | null {
  if (durationMs < MIN_RECORDING_DURATION_MS) {
    return "Recording too short. Hold the button a little longer and try again.";
  }
  return null;
}
