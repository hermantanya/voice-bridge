import { getOpenAIClient } from "./openai.js";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  he: "Hebrew",
  ru: "Russian",
};

function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
): Promise<string> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          `You translate spoken conversation text from ${languageLabel(sourceLang)} to ${languageLabel(targetLang)}. ` +
          "Return only the translated text with no quotes or explanation.",
      },
      { role: "user", content: text },
    ],
  });

  const translated = response.choices[0]?.message?.content?.trim();

  if (!translated) {
    throw new Error("Translation returned empty text");
  }

  return translated;
}
