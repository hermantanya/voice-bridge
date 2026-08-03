export type SupportedLanguage = "en" | "he" | "ru";

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ["en", "he", "ru"];

export function normalizeDetectedLanguage(
  code: string | undefined | null,
): SupportedLanguage | null {
  if (!code) {
    return null;
  }

  const normalized = code.trim().toLowerCase().split("-")[0];
  if (normalized === "en" || normalized === "he" || normalized === "ru") {
    return normalized;
  }

  return null;
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
