/** Minimum decoded audio size before calling Whisper (avoids empty/corrupt uploads). */
export const MIN_AUDIO_BYTES = 512;

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
]);

/**
 * Maps client-reported extensions to Whisper-compatible file extensions.
 * iOS expo-av used `.caf` URIs for AAC; Whisper expects mp4/m4a, not caf.
 */
export function normalizeAudioFormat(format: string | undefined): string {
  const raw = (format ?? "webm").trim().toLowerCase().replace(/^\./, "");
  if (raw === "caf" || raw === "x-caf") {
    return "m4a";
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
    default:
      return "audio/webm";
  }
}

export function validateAudioBuffer(audio: Buffer): string | null {
  if (audio.length < MIN_AUDIO_BYTES) {
    return "Recording too short. Hold the button a little longer and try again.";
  }
  return null;
}
