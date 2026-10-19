import { File } from "node:buffer";

import { getOpenAIClient } from "./openai.js";
import {
  normalizeDetectedLanguage,
  type SupportedLanguage,
} from "./languageDetection.js";

const MIME_BY_FORMAT: Record<string, string> = {
  webm: "audio/webm",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  caf: "audio/x-caf",
};

export type TranscriptionResult = {
  text: string;
  detectedLang: SupportedLanguage;
};

export async function transcribe(
  audio: Buffer,
  format = "webm",
  languageOverride?: string,
): Promise<TranscriptionResult> {
  const openai = getOpenAIClient();
  const mimeType = MIME_BY_FORMAT[format] ?? "audio/webm";
  const file = new File([audio], `audio.${format}`, { type: mimeType });

  if (languageOverride) {
    const overrideLang = normalizeDetectedLanguage(languageOverride);
    if (!overrideLang) {
      throw new Error("sourceLangOverride must be en, he, or ru");
    }

    const response = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: overrideLang,
    });

    return {
      text: response.text.trim(),
      detectedLang: overrideLang,
    };
  }

  const response = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
    response_format: "verbose_json",
  });

  const detectedLang = normalizeDetectedLanguage(response.language);
  if (!detectedLang) {
    throw new Error(
      `Unsupported detected language: ${response.language ?? "unknown"}. Supported: English, Hebrew, Russian.`,
    );
  }

  return {
    text: response.text.trim(),
    detectedLang,
  };
}
