/** Android default; iOS push-to-talk uses WAV (see pushToTalkRecordingOptions). */
export const NATIVE_RECORDING_FORMAT = "m4a";

/** Minimum encoded audio bytes inside wav/m4a (excludes empty moov/mdat shells). */
export const MIN_ENCODED_AUDIO_BYTES = 512;

export function nativeRecordingFormatFromUri(uri: string): string {
  try {
    const pathname = new URL(uri).pathname.toLowerCase();
    if (pathname.endsWith(".wav")) {
      return "wav";
    }
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
  if (lower.includes(".wav")) {
    return "wav";
  }
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

function readFourCc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16) |
    ((bytes[offset + 3] ?? 0) << 24)
  ) >>> 0;
}

function wavPcmDataBytes(bytes: Uint8Array): number {
  if (!asciiAt(bytes, 0, "RIFF") || !asciiAt(bytes, 8, "WAVE")) {
    return 0;
  }

  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkId = readFourCc(bytes, offset);
    const chunkSize = readUint32Le(bytes, offset + 4);
    if (chunkId === "data") {
      return Math.max(0, Math.min(chunkSize, bytes.length - offset - 8));
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return 0;
}

function isobmffMdatPayloadBytes(bytes: Uint8Array): number {
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    const boxSize = readUint32Be(bytes, offset);
    const boxType = readFourCc(bytes, offset + 4);
    if (boxSize < 8) {
      break;
    }

    if (boxType === "mdat") {
      if (boxSize === 0) {
        return Math.max(0, bytes.length - offset - 8);
      }
      return Math.max(0, boxSize - 8);
    }

    offset += boxSize;
  }

  return 0;
}

/** Whisper rejects CAF; m4a needs non-empty mdat, not just an ftyp/moov shell. */
export function hasWhisperReadyContainer(audioBase64: string): boolean {
  const format = detectUploadFormatFromBase64(audioBase64);
  if (!format || format === "caf") {
    return false;
  }

  const bytes = decodeBase64Prefix(audioBase64, 65_536);
  if (!bytes) {
    return false;
  }

  if (format === "wav") {
    return wavPcmDataBytes(bytes) >= MIN_ENCODED_AUDIO_BYTES;
  }

  if (format === "m4a" || format === "mp4") {
    return isobmffMdatPayloadBytes(bytes) >= MIN_ENCODED_AUDIO_BYTES;
  }

  return true;
}

export function hasValidRecordingContainer(audioBase64: string): boolean {
  return hasWhisperReadyContainer(audioBase64);
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
