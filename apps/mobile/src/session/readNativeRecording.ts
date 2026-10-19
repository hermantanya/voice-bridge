import { File } from "expo-file-system";
import {
  EncodingType,
  getInfoAsync,
  readAsStringAsync,
} from "expo-file-system/legacy";

import { MIN_RECORDING_BYTES } from "./nativeRecordingFormat";
import {
  getNativeRecordingUri,
  type NativeRecordingRef,
} from "./nativeRecordingUri";

export type { NativeRecordingRef } from "./nativeRecordingUri";
export {
  getNativeRecordingUri,
  nativeRecordingDurationMs,
} from "./nativeRecordingUri";

const URI_RETRY_ATTEMPTS = 8;
const URI_RETRY_DELAY_MS = 40;
const FILE_STABLE_ATTEMPTS = 12;
const FILE_STABLE_DELAY_MS = 45;
const READ_RETRY_ATTEMPTS = 4;
const READ_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function resolveNativeRecordingUriWithRetry(
  recording: NativeRecordingRef,
): Promise<string | null> {
  for (let attempt = 0; attempt < URI_RETRY_ATTEMPTS; attempt += 1) {
    const uri = getNativeRecordingUri(recording);
    if (uri) {
      return uri;
    }
    if (attempt < URI_RETRY_ATTEMPTS - 1) {
      await sleep(URI_RETRY_DELAY_MS);
    }
  }
  return null;
}

async function waitForStableFileSize(uri: string): Promise<number | null> {
  let previousSize = -1;

  for (let attempt = 0; attempt < FILE_STABLE_ATTEMPTS; attempt += 1) {
    const info = await getInfoAsync(uri);
    if (!info.exists) {
      if (attempt < FILE_STABLE_ATTEMPTS - 1) {
        await sleep(FILE_STABLE_DELAY_MS);
      }
      continue;
    }

    if (info.size >= MIN_RECORDING_BYTES && info.size === previousSize) {
      return info.size;
    }

    previousSize = info.size;
    if (attempt < FILE_STABLE_ATTEMPTS - 1) {
      await sleep(FILE_STABLE_DELAY_MS);
    }
  }

  const finalInfo = await getInfoAsync(uri);
  if (finalInfo.exists && finalInfo.size >= MIN_RECORDING_BYTES) {
    return finalInfo.size;
  }

  return null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  const encode =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa.bind(globalThis)
      : null;
  if (!encode) {
    throw new Error("Base64 encoding is unavailable.");
  }

  return encode(binary);
}

async function readBase64ViaLegacy(uri: string): Promise<string> {
  return readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });
}

async function readBase64ViaFileApi(uri: string): Promise<string> {
  const file = new File(uri);
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < MIN_RECORDING_BYTES) {
    throw new Error("Recording file is too small.");
  }
  return arrayBufferToBase64(buffer);
}

export async function readNativeRecordingAsBase64(
  recording: NativeRecordingRef,
): Promise<{ audioBase64: string; uri: string } | null> {
  const uri = await resolveNativeRecordingUriWithRetry(recording);
  if (!uri) {
    return null;
  }

  const fileSize = await waitForStableFileSize(uri);
  if (fileSize === null) {
    return null;
  }

  let lastError: unknown = null;

  for (let attempt = 0; attempt < READ_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const audioBase64 = (await readBase64ViaLegacy(uri)).trim();
      if (audioBase64) {
        return { audioBase64, uri };
      }
    } catch (error) {
      lastError = error;
    }

    if (attempt < READ_RETRY_ATTEMPTS - 1) {
      await sleep(READ_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  try {
    const audioBase64 = (await readBase64ViaFileApi(uri)).trim();
    if (audioBase64) {
      return { audioBase64, uri };
    }
  } catch (error) {
    lastError = error;
  }

  if (lastError instanceof Error) {
    console.warn("readNativeRecordingAsBase64 failed:", lastError.message);
  }

  return null;
}
