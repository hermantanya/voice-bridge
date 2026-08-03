/**
 * v1.2 spike: Fish Audio Track 1 — private voice clone + multilingual TTS.
 *
 * Usage:
 *   cd server
 *   cp .env.example .env   # add FISH_API_KEY from https://fish.audio
 *   npm run spike:voice:fish
 *
 * Full enrollment test:
 *   npm run spike:voice:fish -- --sample ./tmp/hebrew-voice-sample.m4a
 *
 * Re-test TTS on existing clone:
 *   npm run spike:voice:fish -- --reference YOUR_VOICE_ID
 *
 * Compare production model (uses credits):
 *   npm run spike:voice:fish -- --reference YOUR_VOICE_ID --model s2.1-pro
 */
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPrivateFishVoice,
  listMyFishVoices,
  synthesizeFishSpeech,
  type FishTtsModel,
} from "../src/voices/fishAudio.js";

dotenv.config();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(scriptDir, "../tmp/voice-spike-fish");

// Pure-language phrases — mixed EN inside HE/RU caused gibberish in spikes.
const LANGUAGE_SAMPLES = [
  {
    code: "en",
    text: "Hello, this is a test of my own voice. I hope you can hear me clearly.",
  },
  {
    code: "he",
    text: "שלום, זה מבחן של הקול שלי. אני מקווה שאפשר לשמוע אותי בבירור.",
  },
  {
    code: "he-simple",
    text: "שלום, מה שלומך היום?",
  },
  {
    code: "ru",
    text: "Привет, это тест моего голоса. Надеюсь, меня хорошо слышно.",
  },
] as const;

const FISH_TTS_MODELS = new Set<FishTtsModel>([
  "s2.1-pro-free",
  "s2.1-pro",
  "s2-pro",
]);

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

function resolveFishTtsModel(value: string | undefined): FishTtsModel {
  if (value && FISH_TTS_MODELS.has(value as FishTtsModel)) {
    return value as FishTtsModel;
  }
  return "s2.1-pro-free";
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

function printReport(results: StepResult[], ttsModel: FishTtsModel): boolean {
  console.log("\n=== Voice Bridge v1.2 Fish Audio Spike ===\n");

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
    console.log(`      ${result.detail}\n`);
  }

  const access = results.find((r) => r.name === "Fish API access (list voices)");
  const clone = results.find((r) => r.name === "Create private voice clone");
  const ttsSteps = results.filter((r) => r.name.startsWith("TTS "));

  console.log("--- Verdict ---");

  if (!access?.ok) {
    console.log(
      "Blocked: Fish API not reachable. Check FISH_API_KEY and account balance.",
    );
    return false;
  }

  if (!clone) {
    console.log(
      "Partial: API works. Run with --sample ./path.wav to test private clone + TTS.",
    );
    console.log(
      "Re-test TTS: npm run spike:voice:fish -- --reference YOUR_VOICE_ID",
    );
    console.log(
      "Need ~15–60s of clean single-speaker audio (wav, mp3, m4a, webm).",
    );
    return true;
  }

  if (!clone.ok) {
    console.log(
      "Blocked: cannot create private voice. Check sample audio or API credits.",
    );
    return false;
  }

  if (ttsSteps.every((step) => step.ok)) {
    console.log(
      `Track 1 Fish TTS complete (${ttsModel}). Pure-language test phrases.`,
    );
    console.log(`Listen in: ${outputDir}`);
    console.log(
      "Compare with ElevenLabs spike before picking provider.",
    );
    return true;
  }

  console.log("Partial: clone worked but some TTS languages failed — see above.");
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const samplePath = args.sample;
  const ttsModel = resolveFishTtsModel(args.model);
  const results: StepResult[] = [];

  await mkdir(outputDir, { recursive: true });

  results.push(
    await runStep("Fish API access (list voices)", async () => {
      const voices = await listMyFishVoices();
      return voices.length === 0
        ? "Endpoint OK. No private voices yet."
        : `Endpoint OK. ${voices.length} voice(s): ${voices.map((v) => `${v.id} (${v.visibility ?? "?"})`).join(", ")}`;
    }),
  );

  if (!samplePath && !args.reference) {
    console.log(
      "Optional full test:\n  npm run spike:voice:fish -- --sample ./tmp/hebrew-voice-sample.m4a\n",
    );
    console.log(
      "Re-test TTS:\n  npm run spike:voice:fish -- --reference YOUR_VOICE_ID\n",
    );
    console.log(
      "Record ~15–60s of natural speech in a quiet room (your language).",
    );
    console.log("Fish creates a private model — no public consent script needed.\n");
    printReport(results, ttsModel);
    process.exit(results[0]?.ok ? 0 : 1);
    return;
  }

  let referenceId = args.reference;

  if (!referenceId && samplePath) {
    results.push(
      await runStep("Create private voice clone", async () => {
        const voice = await createPrivateFishVoice({
          title: `voice-bridge-spike-${Date.now()}`,
          description: "Voice Bridge v1.2 spike — private enrollment test",
          samplePath,
          sampleTranscript: args.transcript,
        });
        referenceId = voice.id;
        return `Voice ID: ${voice.id} (visibility: ${voice.visibility ?? "private"}, state: ${voice.state ?? "unknown"})`;
      }),
    );
  } else if (referenceId) {
    results.push({
      name: "Create private voice clone",
      ok: true,
      detail: `Skipped — using existing reference: ${referenceId}`,
    });
  } else {
    printReport(results, ttsModel);
    process.exit(1);
    return;
  }

  const cloneStep = results.find((r) => r.name === "Create private voice clone");
  if (!cloneStep?.ok || !referenceId) {
    printReport(results, ttsModel);
    process.exit(1);
    return;
  }

  for (const sample of LANGUAGE_SAMPLES) {
    results.push(
      await runStep(`TTS ${sample.code.toUpperCase()}`, async () => {
        const audio = await synthesizeFishSpeech({
          text: sample.text,
          referenceId,
          model: ttsModel,
        });
        const suffix = ttsModel === "s2.1-pro-free" ? sample.code : `${sample.code}-${ttsModel}`;
        const outPath = path.join(outputDir, `fish-clone-${suffix}.mp3`);
        await writeFile(outPath, audio);
        return `${ttsModel} → ${audio.length} bytes → ${outPath}`;
      }),
    );
  }

  const ok = printReport(results, ttsModel);
  process.exit(ok ? 0 : 1);
}

void main();
