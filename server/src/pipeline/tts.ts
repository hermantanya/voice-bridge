import { getOpenAIClient } from "./openai.js";
import {
  ELEVENLABS_IVC_TTS_DEFAULTS,
  elevenLabsLanguageCodeForTts,
  elevenLabsModelForLanguage,
  synthesizeElevenLabsSpeech,
} from "../voices/elevenlabs.js";

type SupportedLanguage = "en" | "he" | "ru";

function normalizeLanguage(code: string | undefined): SupportedLanguage {
  if (code === "he" || code === "ru") {
    return code;
  }
  return "en";
}

export async function synthesize(
  text: string,
  options: {
    voiceId?: string;
    targetLang?: string;
  } = {},
): Promise<Buffer> {
  if (process.env.VOICE_BRIDGE_TEST_TRANSLATE === "1") {
    return Buffer.alloc(0);
  }

  const voiceId = options.voiceId?.trim();
  if (voiceId) {
    const language = normalizeLanguage(options.targetLang);
    const modelId = elevenLabsModelForLanguage(language);

    return synthesizeElevenLabsSpeech({
      text,
      voiceId,
      modelId,
      languageCode: elevenLabsLanguageCodeForTts(language, modelId),
      voiceSettings: ELEVENLABS_IVC_TTS_DEFAULTS.voiceSettings,
    });
  }

  const openai = getOpenAIClient();

  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
