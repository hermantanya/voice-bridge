export type LanguageCode = "en" | "he" | "ru";

export type SpeakerGender = "female" | "male";

export type UserProfile = {
  hearLang: LanguageCode;
  speakerGender: SpeakerGender;
  /** Phase 2: synced ElevenLabs voice_id across devices */
  elevenlabsVoiceId: string | null;
};

export type UserRecord = {
  id: string;
  email: string;
  profile: UserProfile;
  createdAt: string;
  updatedAt: string;
};

export const DEFAULT_USER_PROFILE: UserProfile = {
  hearLang: "en",
  speakerGender: "female",
  elevenlabsVoiceId: null,
};

const LANGUAGE_CODES = new Set<LanguageCode>(["en", "he", "ru"]);
const SPEAKER_GENDERS = new Set<SpeakerGender>(["female", "male"]);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === "string" && LANGUAGE_CODES.has(value as LanguageCode);
}

export function isSpeakerGender(value: unknown): value is SpeakerGender {
  return (
    typeof value === "string" && SPEAKER_GENDERS.has(value as SpeakerGender)
  );
}

export type ProfilePatch = Partial<
  Pick<UserProfile, "hearLang" | "speakerGender">
>;

export function validateProfilePatch(
  body: unknown,
): { ok: true; patch: ProfilePatch } | { ok: false; error: string } {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Expected a JSON object" };
  }

  const patch: ProfilePatch = {};
  const record = body as Record<string, unknown>;

  if ("hearLang" in record) {
    if (!isLanguageCode(record.hearLang)) {
      return { ok: false, error: "hearLang must be en, he, or ru" };
    }
    patch.hearLang = record.hearLang;
  }

  if ("speakerGender" in record) {
    if (!isSpeakerGender(record.speakerGender)) {
      return { ok: false, error: "speakerGender must be female or male" };
    }
    patch.speakerGender = record.speakerGender;
  }

  if ("elevenlabsVoiceId" in record) {
    return {
      ok: false,
      error: "elevenlabsVoiceId sync is not available yet (v1.4 phase 2)",
    };
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: "No supported profile fields to update" };
  }

  return { ok: true, patch };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}
