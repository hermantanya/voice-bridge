const PLACEHOLDER_SERVER_URL = "https://your-server.up.railway.app";

export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? PLACEHOLDER_SERVER_URL;

export const isServerConfigured =
  Boolean(process.env.EXPO_PUBLIC_SERVER_URL) &&
  process.env.EXPO_PUBLIC_SERVER_URL !== PLACEHOLDER_SERVER_URL;

export type LanguageCode = "en" | "he" | "ru";

export type SpeakerGender = "female" | "male";

/** Device preference for session mic behavior (persisted locally). */
export type ConversationMode = "push_to_talk" | "hands_free";

export const CONVERSATION_MODES: {
  value: ConversationMode;
  label: string;
  description: string;
}[] = [
  {
    value: "push_to_talk",
    label: "Push-to-talk",
    description: "Hold the talk button while you speak.",
  },
  {
    value: "hands_free",
    label: "Hands-free",
    description: "Speak naturally; Voice Bridge detects pauses and sends utterances.",
  },
];

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
