import {
  resolveTargetLanguage,
  shouldSkipTranslation,
} from "./languageDetection.js";
import { transcribe } from "./stt.js";
import { translate, type SpeakerGender } from "./translate.js";
import { synthesize } from "./tts.js";

export type PipelineInput = {
  audio: Buffer;
  targetLang: string;
  format?: string;
  sourceLangOverride?: string;
  speakerGender?: SpeakerGender;
  addresseeGender?: SpeakerGender;
  voiceId?: string;
};

export type PipelineResult = {
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  audio: Buffer;
  audioFormat: "mp3";
  latencyMs: number;
  skippedTts?: boolean;
};

export async function runTranslationPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const format = input.format ?? "webm";
  const targetLang = resolveTargetLanguage(input.targetLang);

  const { text: sourceText, detectedLang: sourceLang } = await transcribe(
    input.audio,
    format,
    input.sourceLangOverride,
  );

  if (!sourceText) {
    throw new Error("No speech detected in audio");
  }

  if (shouldSkipTranslation(sourceLang, targetLang)) {
    return {
      sourceLang,
      targetLang,
      sourceText,
      translatedText: sourceText,
      audio: Buffer.alloc(0),
      audioFormat: "mp3",
      latencyMs: Date.now() - startedAt,
      skippedTts: true,
    };
  }

  const translatedText = await translate(
    sourceText,
    sourceLang,
    targetLang,
    input.speakerGender,
    input.addresseeGender,
  );

  const audio = await synthesize(translatedText, {
    voiceId: input.voiceId,
    targetLang,
  });

  return {
    sourceLang,
    targetLang,
    sourceText,
    translatedText,
    audio,
    audioFormat: "mp3",
    latencyMs: Date.now() - startedAt,
  };
}
