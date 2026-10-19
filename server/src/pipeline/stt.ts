import { File } from "node:buffer";

import { getOpenAIClient } from "./openai.js";
import {
  mimeTypeForAudioFormat,
  resolveWhisperUploadFormat,
} from "./audioFormat.js";
import {
  normalizeDetectedLanguage,
  type SupportedLanguage,
} from "./languageDetection.js";

function whisperErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("could not be decoded") ||
    message.includes("format is not supported")
  ) {
    return "Could not read that recording. Hold the button a little longer and try again.";
  }
  return message;
}

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
  const normalizedFormat = resolveWhisperUploadFormat(audio, format);
  const mimeType = mimeTypeForAudioFormat(normalizedFormat);
  const file = new File([audio], `audio.${normalizedFormat}`, {
    type: mimeType,
  });

  try {
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
  } catch (error) {
    throw new Error(whisperErrorMessage(error));
  }
}
