export const SERVER_URL =
  "https://your-server.up.railway.app";

export type LanguageCode = "en" | "he";

export const LANGUAGES: { code: LanguageCode; label: string }[] = [
  { code: "en", label: "English" },
  { code: "he", label: "Hebrew" },
];

export function languageLabel(code: LanguageCode): string {
  return LANGUAGES.find((lang) => lang.code === code)?.label ?? code;
}
