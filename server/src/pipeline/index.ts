import { transcribe } from "./stt.js";
import { translate } from "./translate.js";
import { synthesize } from "./tts.js";

export type PipelineInput = {
  audio: Buffer;
  sourceLang: string;
  targetLang: string;
  format?: string;
};

export type PipelineResult = {
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  audio: Buffer;
  audioFormat: "mp3";
  latencyMs: number;
};

export async function runTranslationPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const format = input.format ?? "webm";

  const sourceText = await transcribe(input.audio, input.sourceLang, format);

  if (!sourceText) {
    throw new Error("No speech detected in audio");
  }

  const translatedText = await translate(
    sourceText,
    input.sourceLang,
    input.targetLang,
  );

  const audio = await synthesize(translatedText);

  return {
    sourceLang: input.sourceLang,
    targetLang: input.targetLang,
    sourceText,
    translatedText,
    audio,
    audioFormat: "mp3",
    latencyMs: Date.now() - startedAt,
  };
}
