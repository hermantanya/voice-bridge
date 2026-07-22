/**
 * v1.2 spike: verify OpenAI custom voice API access for Track 1 (voice enrollment).
 *
 * Usage:
 *   cd server
 *   cp .env.example .env   # add OPENAI_API_KEY (same key as Railway)
 *   npm run spike:voice
 *
 * Full enrollment test (after access check passes):
 *   npm run spike:voice -- \
 *     --consent ./samples/consent.wav \
 *     --sample ./samples/voice-sample.wav \
 *     --language en
 */
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCustomVoice,
  listCustomVoices,
  synthesizeSpeech,
  uploadVoiceConsent,
} from "../src/voices/openaiVoices.js";
import { VOICE_CONSENT_PHRASES, type VoiceConsentLanguage } from "../src/voices/types.js";

dotenv.config();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.join(scriptDir, "../tmp/voice-spike");

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
  console.log("\n=== Voice Bridge v1.2 API Spike ===\n");

  for (const result of results) {
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.name}`);
    console.log(`      ${result.detail}\n`);
  }

  const access = results.find((r) => r.name === "Custom voices API access");
  const preset = results.find((r) => r.name === "Preset TTS (baseline)");

  console.log("--- Verdict ---");

  if (!preset?.ok) {
    console.log("Blocked: baseline TTS failed. Fix OPENAI_API_KEY / billing first.");
    return false;
  }

  if (access?.ok) {
    console.log(
      "Track 1 is viable: custom voices API is reachable on this key.",
    );
    console.log("Next: run full enrollment with --consent and --sample wav files.");
    return true;
  }

  if (access?.detail.toLowerCase().includes("permission")) {
    console.log(
      "Blocked: this API key likely lacks custom voice eligibility.",
    );
    console.log(
      "Action: request custom voice access from OpenAI, or plan ElevenLabs for Track 1.",
    );
    return false;
  }

  console.log(
    "Inconclusive: check FAIL detail above. Endpoint may be new or account-limited.",
  );
  return false;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const results: StepResult[] = [];

  results.push(
    await runStep("Preset TTS (baseline)", async () => {
      await mkdir(outputDir, { recursive: true });
      const audio = await synthesizeSpeech(
        "Voice Bridge spike test.",
        "nova",
      );
      const outPath = path.join(outputDir, "preset-nova.mp3");
      await writeFile(outPath, audio);
      return `Generated ${audio.length} bytes → ${outPath}`;
    }),
  );

  results.push(
    await runStep("Custom voices API access", async () => {
      const voices = await listCustomVoices();
      return voices.length === 0
        ? "Endpoint OK. No custom voices yet (empty list)."
        : `Endpoint OK. ${voices.length} custom voice(s): ${voices.map((v) => v.id).join(", ")}`;
    }),
  );

  const consentPath = args.consent;
  const samplePath = args.sample;
  const language = (args.language ?? "en") as VoiceConsentLanguage;

  if (consentPath && samplePath) {
    if (!VOICE_CONSENT_PHRASES[language]) {
      throw new Error(`Unsupported consent language: ${language}`);
    }

    results.push(
      await runStep("Upload voice consent", async () => {
        const consentId = await uploadVoiceConsent({
          name: `voice-bridge-spike-consent-${Date.now()}`,
          language,
          recordingPath: consentPath,
        });
        return `Consent ID: ${consentId}`;
      }),
    );

    const consentStep = results.at(-1);
    if (consentStep?.ok) {
      const consentId = consentStep.detail.replace("Consent ID: ", "");

      results.push(
        await runStep("Create custom voice", async () => {
          const voice = await createCustomVoice({
            name: `voice-bridge-spike-${Date.now()}`,
            consentId,
            samplePath,
          });
          return `Voice ID: ${voice.id}`;
        }),
      );

      const voiceStep = results.at(-1);
      if (voiceStep?.ok) {
        const voiceId = voiceStep.detail.replace("Voice ID: ", "");

        results.push(
          await runStep("TTS with custom voice", async () => {
            const audio = await synthesizeSpeech(
              "This is a Voice Bridge test in my enrolled voice.",
              { id: voiceId },
              language,
            );
            const outPath = path.join(outputDir, "custom-voice-test.wav");
            await writeFile(outPath, audio);
            return `Generated ${audio.length} bytes → ${outPath}`;
          }),
        );
      }
    }
  } else {
    console.log(
      "Optional full test: npm run spike:voice -- --consent ./path/consent.wav --sample ./path/sample.wav --language en",
    );
    console.log(`Consent phrase (${language}): ${VOICE_CONSENT_PHRASES.en}\n`);
  }

  const ok = printReport(results);
  process.exit(ok ? 0 : 1);
}

void main();
