const PLACEHOLDER_SERVER_URL = "https://your-server.up.railway.app";

export const SERVER_URL =
  process.env.EXPO_PUBLIC_SERVER_URL ?? PLACEHOLDER_SERVER_URL;

export const isServerConfigured =
  Boolean(process.env.EXPO_PUBLIC_SERVER_URL) &&
  process.env.EXPO_PUBLIC_SERVER_URL !== PLACEHOLDER_SERVER_URL;

export type LanguageCode = "en" | "he";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "he", label: "Hebrew" },
];

export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}
