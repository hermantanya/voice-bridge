/** Minimum decoded audio size before calling Whisper (avoids empty/corrupt uploads). */
export const MIN_AUDIO_BYTES = 1600;
/** Keep aligned with apps/mobile/src/session/nativeRecordingFormat.ts */
export const MIN_RECORDING_DURATION_MS = 200;
/** Minimum bytes inside wav `data` or m4a `mdat` (not just container headers). */
export const MIN_ENCODED_AUDIO_BYTES = 512;

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
 */
export function normalizeAudioFormat(format: string | undefined): string {
  const raw = (format ?? "webm").trim().toLowerCase().replace(/^\./, "");
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

function wavPcmDataBytes(audio: Buffer): number {
  if (
    audio.subarray(0, 4).toString("ascii") !== "RIFF" ||
    audio.subarray(8, 12).toString("ascii") !== "WAVE"
  ) {
    return 0;
  }

  let offset = 12;
  while (offset + 8 <= audio.length) {
    const chunkId = audio.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = audio.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return Math.max(0, Math.min(chunkSize, audio.length - offset - 8));
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  return 0;
}

function isobmffMdatPayloadBytes(audio: Buffer): number {
  let offset = 0;
  while (offset + 8 <= audio.length) {
    const boxSize = audio.readUInt32BE(offset);
    const boxType = audio.subarray(offset + 4, offset + 8).toString("ascii");
    if (boxSize < 8) {
      break;
    }

    if (boxType === "mdat") {
      if (boxSize === 0) {
        return Math.max(0, audio.length - offset - 8);
      }
      return Math.max(0, boxSize - 8);
    }

    offset += boxSize;
  }

  return 0;
}

/** OpenAI Whisper does not accept CAF; m4a must contain encoded audio in mdat. */
export function hasWhisperReadyPayload(audio: Buffer): boolean {
  const format = detectAudioFormatFromBuffer(audio);
  if (!format || format === "caf") {
    return false;
  }

  if (format === "wav") {
    return wavPcmDataBytes(audio) >= MIN_ENCODED_AUDIO_BYTES;
  }

  if (format === "m4a" || format === "mp4") {
    return isobmffMdatPayloadBytes(audio) >= MIN_ENCODED_AUDIO_BYTES;
  }

  return true;
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

  if (fromBuffer === "caf" || fromClient === "caf") {
    return fromBuffer ?? "caf";
  }

  return fromBuffer;
}

export function validateAudioBuffer(audio: Buffer): string | null {
  if (audio.length < MIN_AUDIO_BYTES) {
    return "Recording too short. Hold the button a little longer and try again.";
  }
  if (!hasWhisperReadyPayload(audio)) {
    return "Could not read that recording. Hold the button a little longer and try again.";
  }
  return null;
}


export function validateRecordingDurationMs(durationMs: number): string | null {
  if (durationMs < MIN_RECORDING_DURATION_MS) {
    return "Recording too short. Hold the button a little longer and try again.";
  }
  return null;
}
