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
  /** When true, skip TTS synthesis (transcript-only for listener). */
  skipTts?: boolean;
  onTranscriptReady?: (progress: PipelineTranscriptProgress) => void | Promise<void>;
};

export type PipelineStageTimingMs = {
  sttMs: number;
  translateMs: number;
  ttsMs: number;
};

export type PipelineTranscriptProgress = {
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  transcriptLatencyMs: number;
  skippedTts: boolean;
  timing: PipelineStageTimingMs;
};

export type PipelineResult = {
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  translatedText: string;
  audio: Buffer;
  audioFormat: "mp3";
  latencyMs: number;
  transcriptLatencyMs: number;
  skippedTts?: boolean;
  timing: PipelineStageTimingMs;
};

function shouldLogPipelineTiming(): boolean {
  return (
    process.env.PIPELINE_TIMING_LOGS === "1" ||
    process.env.NODE_ENV === "development"
  );
}

function logPipelineTiming(
  timing: PipelineStageTimingMs,
  skippedTts: boolean,
): void {
  if (!shouldLogPipelineTiming()) {
    return;
  }

  console.log(
    `[pipeline] stt=${timing.sttMs}ms translate=${timing.translateMs}ms tts=${timing.ttsMs}ms skippedTts=${skippedTts}`,
  );
}

export async function runTranslationPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const startedAt = Date.now();
  const format = input.format ?? "webm";
  const targetLang = resolveTargetLanguage(input.targetLang);
  const timing: PipelineStageTimingMs = { sttMs: 0, translateMs: 0, ttsMs: 0 };

  const sttStartedAt = Date.now();
  const { text: sourceText, detectedLang: sourceLang } = await transcribe(
    input.audio,
    format,
    input.sourceLangOverride,
  );
  timing.sttMs = Date.now() - sttStartedAt;

  if (!sourceText) {
    throw new Error("No speech detected in audio");
  }

  const sameLanguage = shouldSkipTranslation(sourceLang, targetLang);
  const skipTts = sameLanguage || Boolean(input.skipTts);

  if (sameLanguage) {
    const transcriptLatencyMs = Date.now() - startedAt;
    timing.translateMs = 0;
    timing.ttsMs = 0;
    await input.onTranscriptReady?.({
      sourceLang,
      targetLang,
      sourceText,
      translatedText: sourceText,
      transcriptLatencyMs,
      skippedTts: true,
      timing: { ...timing },
    });
    logPipelineTiming(timing, true);

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
    timing.ttsMs = 0;
    logPipelineTiming(timing, true);
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
  logPipelineTiming(timing, false);

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
