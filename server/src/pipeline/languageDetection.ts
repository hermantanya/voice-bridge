export type SupportedLanguage = "en" | "he" | "ru";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "he", "ru"];

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  en: "en",
  english: "en",
  he: "he",
  hebrew: "he",
  iw: "he",
  ru: "ru",
  russian: "ru",
};

export function normalizeDetectedLanguage(
  code: string | undefined | null,
): SupportedLanguage | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toLowerCase().split("-")[0];
  return LANGUAGE_ALIASES[normalized] ?? null;
}

export function resolveTargetLanguage(code: string | undefined | null): SupportedLanguage {
  return normalizeDetectedLanguage(code) ?? "en";
}

export function shouldSkipTranslation(
  sourceLang: SupportedLanguage,
  targetLang: SupportedLanguage,
): boolean {
  return sourceLang === targetLang;
}
