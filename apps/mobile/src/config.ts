const PLACEHOLDER_SERVER_URL = "https://your-server.up.railway.app";

export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? PLACEHOLDER_SERVER_URL;

export const isServerConfigured =
  Boolean(process.env.EXPO_PUBLIC_SERVER_URL) &&
  process.env.EXPO_PUBLIC_SERVER_URL !== PLACEHOLDER_SERVER_URL;

export type LanguageCode = "en" | "he" | "ru";

export type SpeakerGender = "female" | "male";

export const SPEAKER_GENDERS: { value: SpeakerGender; label: string }[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

export function speakerGenderLabel(gender: SpeakerGender): string {
  return SPEAKER_GENDERS.find((g) => g.value === gender)?.label ?? gender;
}

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "he", label: "Hebrew" },
  { code: "ru", label: "Russian" },
];

export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}
