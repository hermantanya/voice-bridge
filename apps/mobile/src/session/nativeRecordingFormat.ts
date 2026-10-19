/** Matches RecordingPresets.HIGH_QUALITY (expo-audio records AAC in .m4a). */
export const NATIVE_RECORDING_FORMAT = "m4a";

export function nativeRecordingFormatFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname.toLowerCase();
    if (pathname.endsWith(".caf")) {
      return "caf";
    }
    if (pathname.endsWith(".3gp")) {
      return "3gp";
    }
    if (pathname.endsWith(".webm")) {
      return "webm";
    }
    if (pathname.endsWith(".mp4")) {
      return "mp4";
    }
    if (pathname.endsWith(".m4a")) {
      return "m4a";
    }
  } catch {
    // Fall through for file paths without a URL scheme.
  }

  const lower = uri.toLowerCase();
  if (lower.includes(".caf")) {
    return "caf";
  }
  if (lower.includes(".3gp")) {
    return "3gp";
  }
  return NATIVE_RECORDING_FORMAT;
}

/** Whisper accepts mp4/m4a, not Core Audio `.caf` containers from legacy iOS recordings. */
export function nativeRecordingFormatForUpload(uri: string): string {
  const fromUri = nativeRecordingFormatFromUri(uri);
  if (fromUri === "caf") {
    return NATIVE_RECORDING_FORMAT;
  }
  return fromUri;
}

export const MIN_RECORDING_DURATION_MS = 300;
export const MIN_RECORDING_BYTES = 512;

export function isDeliverableRecording(
  audioBase64: string,
  recordingDurationMs: number,
): boolean {
  if (!audioBase64.trim()) {
    return false;
  }
  if (recordingDurationMs < MIN_RECORDING_DURATION_MS) {
    return false;
  }

  const byteLength = Math.floor((audioBase64.length * 3) / 4);
  return byteLength >= MIN_RECORDING_BYTES;
}
