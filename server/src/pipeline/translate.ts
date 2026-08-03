import { getOpenAIClient } from "./openai.js";
import {
  buildGenderInstruction,
  type SpeakerGender,
} from "./genderInstruction.js";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  he: "Hebrew",
  ru: "Russian",
};

function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export type { SpeakerGender };

export async function translate(
  text: string,
  sourceLang: string,
  targetLang: string,
  speakerGender?: SpeakerGender,
  addresseeGender?: SpeakerGender,
): Promise<string> {
  const openai = getOpenAIClient();
  const genderNote = buildGenderInstruction(speakerGender, addresseeGender);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content:
          `You translate spoken conversation text from ${languageLabel(sourceLang)} to ${languageLabel(targetLang)}.` +
          genderNote +
          " Return only the translated text with no quotes or explanation.",
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
