/**
 * v1.2 spike: Fish Audio Track 1 — private voice clone + multilingual TTS.
 *
 * Usage:
 *   cd server
 *   cp .env.example .env   # add FISH_API_KEY from https://fish.audio
 *   npm run spike:voice:fish
 *
 * Full enrollment test:
 *   npm run spike:voice:fish -- --sample ./tmp/voice-sample.wav
 *
 * Compare with OpenAI spike:
 *   npm run spike:voice
 */
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createPrivateFishVoice,
  listMyFishVoices,
  synthesizeFishSpeech,
} from "../src/voices/fishAudio.js";

dotenv.config();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(scriptDir, "../tmp/voice-spike-fish");

const LANGUAGE_SAMPLES = [
  {
    code: "en",
    text: "This is a Voice Bridge test in my enrolled voice.",
  },
  {
    code: "he",
    text: "זה מבחן של Voice Bridge בקול שלי.",
  },
  {
    code: "ru",
    text: "Это тест Voice Bridge моим голосом.",
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
      "Need ~15–30s of clean single-speaker audio (wav, mp3, m4a, webm).",
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
      "Track 1 viable with Fish: private clone + EN/HE/RU TTS (s2.1-pro-free).",
    );
    console.log(`Listen in: ${outputDir}`);
    console.log(
      "Compare quality/latency with ElevenLabs spike before picking provider.",
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
    await runStep("Fish API access (list voices)", async () => {
      const voices = await listMyFishVoices();
      return voices.length === 0
        ? "Endpoint OK. No private voices yet."
        : `Endpoint OK. ${voices.length} voice(s): ${voices.map((v) => `${v.id} (${v.visibility ?? "?"})`).join(", ")}`;
    }),
  );

  if (!samplePath) {
    console.log(
      "Optional full test:\n  npm run spike:voice:fish -- --sample ./tmp/voice-sample.wav\n",
    );
    console.log(
      "Record ~15–30s of natural speech in a quiet room (your language).",
    );
    console.log("Fish creates a private model — no public consent script needed.\n");
    printReport(results);
    process.exit(results[0]?.ok ? 0 : 1);
    return;
  }

  let referenceId = args.reference;

  if (!referenceId) {
    results.push(
      await runStep("Create private voice clone", async () => {
        const voice = await createPrivateFishVoice({
          title: `voice-bridge-spike-${Date.now()}`,
          description: "Voice Bridge v1.2 spike — private enrollment test",
          samplePath,
        });
        referenceId = voice.id;
        return `Voice ID: ${voice.id} (visibility: ${voice.visibility ?? "private"}, state: ${voice.state ?? "unknown"})`;
      }),
    );
  } else {
    results.push({
      name: "Create private voice clone",
      ok: true,
      detail: `Skipped — using existing reference: ${referenceId}`,
    });
  }

  const cloneStep = results.find((r) => r.name === "Create private voice clone");
  if (!cloneStep?.ok || !referenceId) {
    printReport(results);
    process.exit(1);
    return;
  }

  for (const sample of LANGUAGE_SAMPLES) {
    results.push(
      await runStep(`TTS ${sample.code.toUpperCase()}`, async () => {
        const audio = await synthesizeFishSpeech({
          text: sample.text,
          referenceId,
          model: "s2.1-pro-free",
        });
        const outPath = path.join(outputDir, `fish-clone-${sample.code}.mp3`);
        await writeFile(outPath, audio);
        return `${audio.length} bytes → ${outPath}`;
      }),
    );
  }

  const ok = printReport(results);
  process.exit(ok ? 0 : 1);
}

void main();
