/**
 * v1.2 spike: ElevenLabs IVC — instant voice clone + multilingual TTS.
 *
 * Usage:
 *   cd server
 *   cp .env.example .env   # add ELEVENLABS_API_KEY
 *   npm run spike:voice:elevenlabs
 *
 * Full enrollment test:
 *   npm run spike:voice:elevenlabs -- --sample ./tmp/hebrew-voice-sample.m4a
 */
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createInstantVoiceClone,
  ELEVENLABS_IVC_TTS_DEFAULTS,
  elevenLabsLanguageCodeForTts,
  elevenLabsModelForLanguage,
  listElevenLabsVoices,
  synthesizeElevenLabsSpeech,
} from "../src/voices/elevenlabs.js";

dotenv.config();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(scriptDir, "../tmp/voice-spike-elevenlabs");

// Pure-language phrases only — mixed EN inside HE/RU caused syllable stutter in spikes.
const LANGUAGE_SAMPLES = [
  {
    code: "en",
    lang: "en" as const,
    text: "Hello, this is a test of my own voice. I hope you can hear me clearly.",
  },
  {
    code: "he",
    lang: "he" as const,
    text: "שלום, זה מבחן של הקול שלי. אני מקווה שאפשר לשמוע אותי בבירור.",
  },
  {
    code: "he-simple",
    lang: "he" as const,
    text: "שלום, מה שלומך היום?",
  },
  {
    code: "ru",
    lang: "ru" as const,
    text: "Привет, это тест моего голоса. Надеюсь, меня хорошо слышно.",
  },
] as const;

type StepResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      args[token.slice(2)] = argv[i + 1] ?? "true";
      i += 1;
    }
  }
  return args;
}

async function runStep(
  name: string,
  fn: () => Promise<string>,
): Promise<StepResult> {
  try {
    const detail = await fn();
    return { name, ok: true, detail };
  } catch (error) {
    return {
      name,
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

function printReport(results: StepResult[]): boolean {
  console.log("\n=== Voice Bridge v1.2 ElevenLabs Spike ===\n");

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
    console.log(`      ${result.detail}\n`);
  }

  const access = results.find(
    (r) => r.name === "ElevenLabs API access (list voices)",
  );
  const clone = results.find((r) => r.name === "Create instant voice clone");
  const ttsSteps = results.filter((r) => r.name.startsWith("TTS "));

  console.log("--- Verdict ---");

  if (!access?.ok) {
    console.log(
      "Blocked: ElevenLabs API not reachable. Check ELEVENLABS_API_KEY and Starter tier.",
    );
    return false;
  }

  if (!clone) {
    console.log(
      "Partial: API works. Run with --sample ./path.wav to test IVC + TTS.",
    );
    console.log(
      "Need ~1–2 minutes of clean single-speaker audio (wav, mp3, m4a, webm).",
    );
    return true;
  }

  if (!clone.ok) {
    console.log(
      "Blocked: cannot create voice clone. Check sample audio, IVC tier, or voice slot limit.",
    );
    return false;
  }

  if (ttsSteps.every((step) => step.ok)) {
    console.log(
      "Track 1 viable with ElevenLabs: IVC clone + EN/HE/RU TTS (v3 for HE, multilingual_v2 for EN/RU).",
    );
    console.log(`Listen in: ${outputDir}`);
    console.log(
      "Compare quality with Fish spike outputs before picking provider.",
    );
    return true;
  }

  console.log("Partial: clone worked but some TTS languages failed — see above.");
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const samplePath = args.sample;
  const results: StepResult[] = [];

  await mkdir(outputDir, { recursive: true });

  results.push(
    await runStep("ElevenLabs API access (list voices)", async () => {
      const voices = await listElevenLabsVoices();
      const cloned = voices.filter((voice) => voice.category === "cloned");
      return cloned.length === 0
        ? `Endpoint OK. ${voices.length} voice(s) in library, no clones yet.`
        : `Endpoint OK. ${voices.length} voice(s), ${cloned.length} clone(s).`;
    }),
  );

  if (!samplePath && !args.voice) {
    console.log(
      "Optional full test:\n  npm run spike:voice:elevenlabs -- --sample ./tmp/hebrew-voice-sample.m4a\n",
    );
    console.log(
      "Re-test TTS on existing clone:\n  npm run spike:voice:elevenlabs -- --voice YOUR_VOICE_ID\n",
    );
    console.log(
      "Record ~1–2 minutes of natural speech (ElevenLabs IVC minimum).",
    );
    console.log("Requires ElevenLabs Starter tier or above for IVC.\n");
    printReport(results);
    process.exit(results[0]?.ok ? 0 : 1);
    return;
  }

  let voiceId = args.voice;

  if (!voiceId && samplePath) {
    results.push(
      await runStep("Create instant voice clone", async () => {
        const voice = await createInstantVoiceClone({
          name: `voice-bridge-spike-${Date.now()}`,
          description: "Voice Bridge v1.2 spike — private IVC enrollment test",
          samplePath,
          gender:
            args.gender === "male" || args.gender === "female"
              ? args.gender
              : undefined,
        });
        voiceId = voice.voice_id;
        return `Voice ID: ${voice.voice_id}`;
      }),
    );
  } else if (voiceId) {
    results.push({
      name: "Create instant voice clone",
      ok: true,
      detail: `Skipped — using existing voice: ${voiceId}`,
    });
  } else {
    printReport(results);
    process.exit(1);
    return;
  }

  const cloneStep = results.find((r) => r.name === "Create instant voice clone");
  if (!cloneStep?.ok || !voiceId) {
    printReport(results);
    process.exit(1);
    return;
  }

  for (const sample of LANGUAGE_SAMPLES) {
    results.push(
      await runStep(`TTS ${sample.code.toUpperCase()}`, async () => {
        const modelId = elevenLabsModelForLanguage(sample.lang);
        const languageCode = elevenLabsLanguageCodeForTts(
          sample.lang,
          modelId,
        );
        const audio = await synthesizeElevenLabsSpeech({
          text: sample.text,
          voiceId,
          modelId,
          languageCode,
          voiceSettings: ELEVENLABS_IVC_TTS_DEFAULTS.voiceSettings,
        });
        const outPath = path.join(
          outputDir,
          `elevenlabs-clone-${sample.code}.mp3`,
        );
        await writeFile(outPath, audio);
        return `${modelId} → ${audio.length} bytes → ${outPath}`;
      }),
    );
  }

  const ok = printReport(results);
  process.exit(ok ? 0 : 1);
}

void main();
