import {
  resolveTargetLanguage,
  shouldSkipTranslation,
  type SupportedLanguage,
} from "./languageDetection.js";
import { translate, type SpeakerGender } from "./translate.js";
import { synthesize } from "./tts.js";
import type {
  PipelineResult,
  PipelineStageTimingMs,
  PipelineTranscriptProgress,
} from "./index.js";

export type TranslationFromTranscriptInput = {
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  speakerGender?: SpeakerGender;
  addresseeGender?: SpeakerGender;
  voiceId?: string;
  skipTts?: boolean;
  onTranscriptReady?: (
    progress: PipelineTranscriptProgress,
  ) => void | Promise<void>;
};

export async function runTranslationFromTranscript(
  input: TranslationFromTranscriptInput,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const targetLang = resolveTargetLanguage(input.targetLang);
  const sourceText = input.sourceText.trim();
  const sourceLang = resolveTargetLanguage(
    input.sourceLang,
  ) as SupportedLanguage;
  const timing: PipelineStageTimingMs = { sttMs: 0, translateMs: 0, ttsMs: 0 };

  if (!sourceText) {
    throw new Error("No speech detected in audio");
  }

  const sameLanguage = shouldSkipTranslation(sourceLang, targetLang);
  const skipTts = sameLanguage || Boolean(input.skipTts);

  if (sameLanguage) {
    const transcriptLatencyMs = Date.now() - startedAt;
    await input.onTranscriptReady?.({
      sourceLang,
      targetLang,
      sourceText,
      translatedText: sourceText,
      transcriptLatencyMs,
      skippedTts: true,
      timing: { ...timing },
    });

    return {
      sourceLang,
      targetLang,
      sourceText,
      translatedText: sourceText,
      audio: Buffer.alloc(0),
      audioFormat: "mp3",
      latencyMs: transcriptLatencyMs,
      transcriptLatencyMs,
      skippedTts: true,
      timing,
    };
  }

  const translateStartedAt = Date.now();
  const translatedText = await translate(
    sourceText,
    sourceLang,
    targetLang,
    input.speakerGender,
    input.addresseeGender,
  );
  timing.translateMs = Date.now() - translateStartedAt;
  const transcriptLatencyMs = Date.now() - startedAt;

  await input.onTranscriptReady?.({
    sourceLang,
    targetLang,
    sourceText,
    translatedText,
    transcriptLatencyMs,
    skippedTts: skipTts,
    timing: { ...timing },
  });

  if (skipTts) {
    return {
      sourceLang,
      targetLang,
      sourceText,
      translatedText,
      audio: Buffer.alloc(0),
      audioFormat: "mp3",
      latencyMs: transcriptLatencyMs,
      transcriptLatencyMs,
      skippedTts: true,
      timing,
    };
  }

  const ttsStartedAt = Date.now();
  const audio = await synthesize(translatedText, {
    voiceId: input.voiceId,
    targetLang,
  });
  timing.ttsMs = Date.now() - ttsStartedAt;

  return {
    sourceLang,
    targetLang,
    sourceText,
    translatedText,
    audio,
    audioFormat: "mp3",
    latencyMs: Date.now() - startedAt,
    transcriptLatencyMs,
    skippedTts: false,
    timing,
  };
}
