export const MIN_ENROLLMENT_DURATION_MS = 30_000;
export const MAX_ENROLLMENT_AUDIO_BYTES = 12 * 1024 * 1024;

export type EnrollmentLanguage = "en" | "he" | "ru";
export type EnrollmentGender = "female" | "male";

export type VoiceEnrollmentRequest = {
  audioBase64?: string;
  format?: string;
  language?: string;
  gender?: string;
  durationMs?: number;
  replaceVoiceId?: string;
};

export function enrollmentSampleFilename(format: string): string {
  const normalized = format.trim().toLowerCase().replace(/^\./, "");
  const ext = normalized || "webm";
  return `voice-bridge-enrollment.${ext}`;
}

export function enrollmentPreviewText(
  language: EnrollmentLanguage,
  gender?: EnrollmentGender,
): string {
  if (language === "he") {
    return gender === "male"
      ? "שלום, זה הקול שלי ב-Voice Bridge."
      : "שלום, זה הקול שלי ב-Voice Bridge.";
  }
  if (language === "ru") {
    return "Привет, это мой голос в Voice Bridge.";
  }
  return "Hello, this is my voice in Voice Bridge.";
}

export function validateVoiceEnrollmentRequest(
  payload: VoiceEnrollmentRequest,
):
  | {
      ok: true;
      audio: Buffer;
      format: string;
      language: EnrollmentLanguage;
      gender?: EnrollmentGender;
      durationMs: number;
      replaceVoiceId?: string;
    }
  | { ok: false; error: string } {
  if (!payload.audioBase64?.trim()) {
    return { ok: false, error: "audioBase64 is required" };
  }

  let audio: Buffer;
  try {
    audio = Buffer.from(payload.audioBase64, "base64");
  } catch {
    return { ok: false, error: "audioBase64 must be valid base64" };
  }

  if (audio.length === 0) {
    return { ok: false, error: "Enrollment audio is empty" };
  }

  if (audio.length > MAX_ENROLLMENT_AUDIO_BYTES) {
    return { ok: false, error: "Enrollment audio is too large" };
  }

  const durationMs = Math.max(0, Math.round(payload.durationMs ?? 0));
  if (durationMs < MIN_ENROLLMENT_DURATION_MS) {
    return {
      ok: false,
      error: `Record at least ${MIN_ENROLLMENT_DURATION_MS / 1000} seconds`,
    };
  }

  const language = payload.language;
  if (language !== "en" && language !== "he" && language !== "ru") {
    return { ok: false, error: "language must be en, he, or ru" };
  }

  const format = payload.format?.trim() || "webm";
  const gender =
    payload.gender === "female" || payload.gender === "male"
      ? payload.gender
      : undefined;
  const replaceVoiceId = payload.replaceVoiceId?.trim() || undefined;

  return {
    ok: true,
    audio,
    format,
    language,
    gender,
    durationMs,
    replaceVoiceId,
  };
}

export function buildVoiceCloneName(language: EnrollmentLanguage): string {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  return `Voice Bridge ${language.toUpperCase()} ${stamp}`;
}

export type VoicePreviewRequest = {
  voiceId?: string;
  language?: string;
  gender?: string;
};

export function validateVoicePreviewRequest(payload: VoicePreviewRequest):
  | {
      ok: true;
      voiceId: string;
      language: EnrollmentLanguage;
      gender?: EnrollmentGender;
    }
  | { ok: false; error: string } {
  const voiceId = payload.voiceId?.trim();
  if (!voiceId) {
    return { ok: false, error: "voiceId is required" };
  }

  const language = payload.language;
  if (language !== "en" && language !== "he" && language !== "ru") {
    return { ok: false, error: "language must be en, he, or ru" };
  }

  const gender =
    payload.gender === "female" || payload.gender === "male"
      ? payload.gender
      : undefined;

  return {
    ok: true,
    voiceId,
    language,
    gender,
  };
}
