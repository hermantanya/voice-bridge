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

/** Extension sent to the server; must match the on-disk container (do not remap CAF → m4a). */
export function nativeRecordingFormatForUpload(uri: string): string {
  return nativeRecordingFormatFromUri(uri);
}

/** Wall-clock / recorder duration; keep low so normal holds are not rejected. */
export const MIN_RECORDING_DURATION_MS = 200;
/**
 * ~200 ms at 128 kbps AAC is ~3.2 KB; 512 B only catches container headers and
 * Whisper rejects those with "could not be decoded".
 */
export const MIN_RECORDING_BYTES = 1600;

function decodeBase64Prefix(base64: string, byteCount: number): Uint8Array | null {
  const trimmed = base64.trim();
  if (!trimmed) {
    return null;
  }

  const sliceLen = Math.min(trimmed.length, Math.ceil((byteCount * 4) / 3));
  const chunk = trimmed.slice(0, sliceLen);

  const decode =
    typeof globalThis.atob === "function"
      ? globalThis.atob.bind(globalThis)
      : null;
  if (!decode) {
    return null;
  }

  try {
    const binary = decode(chunk);
    const out = new Uint8Array(Math.min(binary.length, byteCount));
    for (let i = 0; i < out.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (offset + text.length > bytes.length) {
    return false;
  }
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[offset + i] !== text.charCodeAt(i)) {
      return false;
    }
  }
  return true;
}

/** Sniff container magic from payload bytes (more reliable than URI extension). */
export function detectUploadFormatFromBase64(
  audioBase64: string,
): string | null {
  const bytes = decodeBase64Prefix(audioBase64, 16);
  if (!bytes || bytes.length < 4) {
    return null;
  }

  if (asciiAt(bytes, 0, "caff")) {
    return "caf";
  }

  if (bytes.length >= 8 && asciiAt(bytes, 4, "ftyp")) {
    return "m4a";
  }

  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }

  if (asciiAt(bytes, 0, "RIFF") && asciiAt(bytes, 8, "WAVE")) {
    return "wav";
  }

  return null;
}

export function hasValidRecordingContainer(audioBase64: string): boolean {
  return detectUploadFormatFromBase64(audioBase64) !== null;
}

export function resolveNativeUploadFormat(
  uri: string,
  audioBase64: string,
): string {
  return (
    detectUploadFormatFromBase64(audioBase64) ??
    nativeRecordingFormatForUpload(uri)
  );
}

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

  const byteLength = Math.floor((audioBase64.trim().length * 3) / 4);
  if (byteLength < MIN_RECORDING_BYTES) {
    return false;
  }

  return hasValidRecordingContainer(audioBase64);
}
